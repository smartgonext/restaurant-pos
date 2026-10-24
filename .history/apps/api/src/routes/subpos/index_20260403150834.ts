import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../app.js';
import { subposAuth } from '../../middleware/posAuth.js';
import { getNextTokenNumber } from '../../utils/tokenCounter.js';
import { recalculateTokenTotals } from '../../utils/taxCalculator.js';
import { emitToRestaurant } from '../../plugins/socket.js';
import { applyKOTConsumption } from '../../utils/inventory.js';

export async function subposRoutes(app: FastifyInstance) {
  // ── POST /api/subpos/login ─── (no auth required)
  app.post('/login', async (request: any, reply: any) => {
    const schema = z.object({
      terminalCode: z.string().min(1).optional(),
      username: z.string().min(1).optional(),
      pin: z.string().min(1).optional(),
      password: z.string().min(1).optional(),
    });
    try {
      const body = schema.parse(request.body);
      const terminalCode = body.terminalCode ?? body.username;
      const pin = body.pin ?? body.password;
      if (!terminalCode || !pin) {
        return reply.status(400).send({ success: false, error: 'terminalCode and pin are required' });
      }
      const terminal = await prisma.subPOSTerminal.findUnique({ where: { terminalCode } });
      if (!terminal || !terminal.isActive) {
        return reply.status(401).send({ success: false, error: 'Invalid credentials or terminal inactive' });
      }
      const valid = await bcrypt.compare(pin, terminal.pin);
      if (!valid) return reply.status(401).send({ success: false, error: 'Invalid credentials' });

      const token = await (app as any).jwt.sign(
        {
          terminalId: terminal.id,
          restaurantId: terminal.restaurantId,
          branchId: terminal.branchId,
          type: 'subpos',
          groupIds: terminal.groupIds,
          username: terminal.name,
        },
        { expiresIn: '12h' },
      );

      return {
        success: true,
        data: {
          token,
          terminal: {
            id: terminal.id,
            name: terminal.name,
            branchId: terminal.branchId,
            groupIds: terminal.groupIds,
          },
        },
      };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err?.message });
    }
  });

  // All routes below require Sub POS auth
  app.addHook('onRequest', subposAuth);

  // ── GET /api/subpos/items ── returns only items in terminal's groupIds
  app.get('/items', async (request: any) => {
    const restaurantId: number = request.restaurantId;
    const groupIds = (request.user?.groupIds as number[]) ?? [];

    const items = await prisma.menuItem.findMany({
      where: {
        restaurantId,
        isAvailable: true,
        ...(groupIds.length > 0 ? { categoryId: { in: groupIds } } : {}),
      },
      include: { category: true },
      orderBy: [{ categoryId: 'asc' }, { sortOrder: 'asc' }],
    });
    return { success: true, data: items };
  });

  // ── GET /api/subpos/categories ── only accessible categories
  app.get('/categories', async (request: any) => {
    const restaurantId: number = request.restaurantId;
    const groupIds = (request.user?.groupIds as number[]) ?? [];
    const categories = await prisma.itemCategory.findMany({
      where: {
        restaurantId,
        ...(groupIds.length > 0 ? { id: { in: groupIds } } : {}),
      },
      orderBy: { sortOrder: 'asc' },
    });
    return { success: true, data: categories };
  });

  // ── GET /api/subpos/customers ──
  app.get('/customers', async (request: any, reply: any) => {
    const restaurantId: number = request.restaurantId;
    const { search } = request.query as { search?: string };
    
    if (!search || search.length < 3) return { success: true, data: [] };
    
    const customers = await prisma.customer.findMany({
      where: {
        restaurantId,
        OR: [
          { phone: { contains: search } },
          { name: { contains: search } }
        ]
      },
      take: 10,
    });
    return { success: true, data: customers };
  });

  // ── POST /api/subpos/token/create ── create new BakeryToken + add initial items
  app.post('/token/create', async (request: any, reply: any) => {
    const restaurantId: number = request.restaurantId;
    const branchId: number = request.branchId;
    const terminalName: string = request.user?.username ?? 'Sub POS';
    const groupIds = (request.user?.groupIds as number[]) ?? [];

    const schema = z.object({
      tableId: z.number().optional(),
      items: z
        .array(
          z.object({
            menuItemId: z.number(),
            quantity: z.number().min(1),
          }),
        )
        .min(1),
      customerName: z.string().optional(),
      customerPhone: z.string().optional(),
    });

    try {
      const body = schema.parse(request.body);

      // 1. Fetch items with categories
      const menuItems = await Promise.all(
        body.items.map(async (i) => {
          const mi = await prisma.menuItem.findFirst({
            where: { id: i.menuItemId, restaurantId },
            include: { category: true }
          });
          if (!mi) throw new Error(`Item ${i.menuItemId} not found`);
          
          if (groupIds.length > 0 && mi.categoryId && !groupIds.includes(mi.categoryId)) {
            throw new Error(`Item "${mi.name}" is not accessible on this terminal`);
          }
          return { ...mi, requestedQty: i.quantity };
        })
      );

      const tokenNumber = await getNextTokenNumber(restaurantId, branchId, prisma);
      const qrCode = uuidv4();

      // Resolve customer if phone provided
      let customerId: number | undefined;
      if (body.customerPhone) {
        const existing = await prisma.customer.findFirst({
          where: { restaurantId, phone: body.customerPhone },
        });
        if (existing) {
          customerId = existing.id;
        } else if (body.customerName) {
          const newCustomer = await prisma.customer.create({
            data: { restaurantId, name: body.customerName, phone: body.customerPhone },
          });
          customerId = newCustomer.id;
        }
      }

      // Check for KOT-enabled items
      const kotItems = menuItems.filter(mi => !mi.category || mi.category.isKOTEnabled);

      const createdKots: number[] = [];
      const token = await prisma.$transaction(async (tx) => {
        // Create Bakery Token
        const tok = await tx.bakeryToken.create({
          data: {
            restaurantId,
            branchId,
            tokenNumber,
            qrCode,
            customerName: body.customerName,
            customerPhone: body.customerPhone,
            customerId,
            items: {
              create: menuItems.map((mi) => ({
                menuItemId: mi.id,
                menuItemName: mi.name,
                price: mi.price,
                quantity: mi.requestedQty,
                total: Number(mi.price) * mi.requestedQty,
                addedBy: `subpos:${terminalName}`,
              })),
            },
          },
          include: { items: true },
        });

        // Create Order + KOT if needed
        if (kotItems.length > 0) {
          const settings = await tx.restaurantSettings.findUnique({ where: { restaurantId } });
          const subtotal = kotItems.reduce((s, i) => s + (Number(i.price) * i.requestedQty), 0);

          const order = await tx.order.create({
            data: {
              restaurantId,
              branchId,
              orderNumber: `${settings?.orderPrefix || 'ORD'}-TEMP`,
              type: 'token',
              subtotal,
              total: subtotal, 
              status: 'running',
            }
          });

          // set deterministic orderNumber using DB id
          const finalOrderNumber = `${settings?.orderPrefix || 'ORD'}-${String(order.id).padStart(5, '0')}`;
          await tx.order.update({ where: { id: order.id }, data: { orderNumber: finalOrderNumber } });

          const kot = await tx.kOT.create({
            data: {
              orderId: order.id,
              restaurantId,
              kotNumber: `${settings?.kotPrefix || 'KOT'}-TEMP`,
              items: {
                create: kotItems.map(ki => ({
                  menuItemId: ki.id,
                  quantity: ki.requestedQty,
                  price: ki.price,
                }))
              }
            }
          });

          // set deterministic kotNumber
          const finalKotNumber = `${settings?.kotPrefix || 'KOT'}-${String(kot.id).padStart(5, '0')}`;
          await tx.kOT.update({ where: { id: kot.id }, data: { kotNumber: finalKotNumber } });

          await tx.bakeryToken.update({ where: { id: tok.id }, data: { orderId: order.id } });

          // refresh kot
          const refreshedKot = await tx.kOT.findUnique({ where: { id: kot.id }, include: { items: { include: { menuItem: true } } } });
          if (refreshedKot) createdKots.push(refreshedKot.id);
          emitToRestaurant(restaurantId, 'new_kot', { ...order, kots: [refreshedKot] });
        }

        if (body.tableId) {
          await tx.table.update({
            where: { id: body.tableId, restaurantId },
            data: { status: 'occupied' },
          });
        }

        return tok;
      });

      await recalculateTokenTotals(token.id, prisma);

      for (const kid of createdKots) {
        try { await applyKOTConsumption(kid, prisma); } catch (err: any) { (app as any).log.warn({ err }, `KOT consume failed ${kid}`); }
      }

      const updated = await prisma.bakeryToken.findUnique({
        where: { id: token.id },
        include: { items: { where: { isRemoved: false } } },
      });

      emitToRestaurant(restaurantId, 'token_created', { tokenId: token.id, tokenNumber, branchId });

      return {
        success: true,
        data: {
          tokenId: token.id,
          tokenNumber,
          qrCode,
          qrUrl: `/token/${qrCode}`,
          token: updated,
        },
      };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err?.message });
    }
  });

  // ── POST /api/subpos/token/:qr/items ── add item to existing token
  app.post('/token/:qr/items', async (request: any, reply: any) => {
    const restaurantId: number = request.restaurantId;
    const { qr } = request.params as { qr: string };
    const terminalName: string = request.user?.username ?? 'Sub POS';
    const groupIds = (request.user?.groupIds as number[]) ?? [];

    const schema = z.object({
      menuItemId: z.number(),
      quantity: z.number().min(1),
    });

    try {
      const body = schema.parse(request.body);

      const token = await prisma.bakeryToken.findFirst({
        where: { qrCode: qr, restaurantId },
      });
      if (!token) return reply.status(404).send({ success: false, error: 'Token not found' });
      if (token.status !== 'open' && token.status !== 'partial_paid') {
        return reply.status(400).send({ success: false, error: 'Token is already closed' });
      }

      const menuItem = await prisma.menuItem.findFirst({ where: { id: body.menuItemId, restaurantId } });
      if (!menuItem) return reply.status(404).send({ success: false, error: 'Item not found' });
      if (groupIds.length > 0 && menuItem.categoryId && !groupIds.includes(menuItem.categoryId)) {
        return reply.status(403).send({ success: false, error: 'Item not accessible on this terminal' });
      }

      await prisma.bakeryTokenItem.create({
        data: {
          tokenId: token.id,
          menuItemId: body.menuItemId,
          menuItemName: menuItem.name,
          price: menuItem.price,
          quantity: body.quantity,
          total: Number(menuItem.price) * body.quantity,
          addedBy: `subpos:${terminalName}`,
        },
      });

      await recalculateTokenTotals(token.id, prisma);
      const updated = await prisma.bakeryToken.findUnique({
        where: { id: token.id },
        include: { items: { where: { isRemoved: false } } },
      });

      emitToRestaurant(restaurantId, 'token_updated', updated);
      return { success: true, data: updated };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err?.message });
    }
  });

  // ── GET /api/subpos/token/:qr ── get full token details
  app.get('/token/:qr', async (request: any, reply: any) => {
    const restaurantId: number = request.restaurantId;
    const { qr } = request.params as { qr: string };
    const token = await prisma.bakeryToken.findFirst({
      where: { qrCode: qr, restaurantId },
      include: {
        items: { where: { isRemoved: false }, include: { menuItem: true } },
        payments: true,
        edits: true,
      },
    });
    if (!token) return reply.status(404).send({ success: false, error: 'Token not found' });
    return { success: true, data: token };
  });

  // ── POST /api/subpos/token/lookup ── find token by QR or number
  app.post('/token/lookup', async (request: any, reply: any) => {
    const restaurantId: number = request.restaurantId;
    const schema = z.object({
      qrCode: z.string().optional(),
      tokenNumber: z.number().optional(),
    }).refine((d) => d.qrCode || d.tokenNumber, { message: 'Provide qrCode or tokenNumber' });

    try {
      const body = schema.parse(request.body);
      const where: any = { restaurantId };
      if (body.qrCode) where.qrCode = body.qrCode;
      else {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        where.tokenNumber = body.tokenNumber;
        where.createdAt = { gte: todayStart };
      }

      const token = await prisma.bakeryToken.findFirst({
        where,
        include: {
          items: { include: { menuItem: true } },
          payments: true,
          edits: true,
          customer: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!token) return reply.status(404).send({ success: false, error: 'Token not found' });
      return { success: true, data: token };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err?.message });
    }
  });

  // ── POST /api/subpos/token/:qr/customer ── attach customer to token
  app.post('/token/:qr/customer', async (request: any, reply: any) => {
    const restaurantId: number = request.restaurantId;
    const { qr } = request.params as { qr: string };
    const schema = z.object({
      customerName: z.string().min(1),
      customerPhone: z.string().min(1),
    });
    try {
      const body = schema.parse(request.body);
      const token = await prisma.bakeryToken.findFirst({ where: { qrCode: qr, restaurantId } });
      if (!token) return reply.status(404).send({ success: false, error: 'Token not found' });

      const previouslyHadCustomer = Boolean(token.customerId);

      let customerId = token.customerId ?? undefined;
      const existing = await prisma.customer.findFirst({ where: { restaurantId, phone: body.customerPhone } });
      if (existing) {
        customerId = existing.id;
      } else {
        const newC = await prisma.customer.create({
          data: { restaurantId, name: body.customerName, phone: body.customerPhone },
        });
        customerId = newC.id;
      }

      let updated = await prisma.bakeryToken.update({
        where: { id: token.id },
        data: { customerName: body.customerName, customerPhone: body.customerPhone, customerId },
        include: { items: { include: { menuItem: true } }, payments: true, customer: true },
      });

      // Retroactive awarding if token already paid and customer was not previously attached
      if (!previouslyHadCustomer && updated.status === 'paid' && customerId) {
        try {
          const tokenTotal = Number(updated.total || 0);
          const totalPaid = (updated.payments || []).reduce((s: number, p: any) => s + Number(p.amount || 0), 0);

          // increment orders
          await prisma.customer.update({ where: { id: customerId }, data: { totalOrders: { increment: 1 } } });

          const loyaltyProgram = await prisma.loyaltyProgram.findFirst({ where: { restaurantId } });
          if (loyaltyProgram?.isActive) {
            const pointsPerRupee = Number((loyaltyProgram as any)?.pointsPerRupee ?? 0.1);
            const pointsEarned = Math.floor(tokenTotal * pointsPerRupee);
            if (pointsEarned > 0) {
              await prisma.customer.update({ where: { id: customerId }, data: { loyaltyPoints: { increment: pointsEarned } } });
              await prisma.loyaltyTransaction.create({ data: { customerId, restaurantId, loyaltyProgramId: loyaltyProgram.id, type: 'earned', points: pointsEarned, note: `Retroactive Token #${updated.tokenNumber}` } });
              await prisma.bakeryToken.update({ where: { id: updated.id }, data: { loyaltyPointsEarned: pointsEarned } });
              updated = await prisma.bakeryToken.findUniqueOrThrow({ where: { id: updated.id }, include: { items: { include: { menuItem: true } }, payments: true, customer: true } });
              emitToRestaurant(restaurantId, 'token_updated', updated);
              emitToRestaurant(restaurantId, 'customer_display_payment_ok', { customerName: updated.customerName, pointsEarned, paid: totalPaid, due: Math.max(0, tokenTotal - totalPaid) });
            } else {
              updated = await prisma.bakeryToken.findUniqueOrThrow({ where: { id: updated.id }, include: { items: { include: { menuItem: true } }, payments: true, customer: true } });
              emitToRestaurant(restaurantId, 'token_updated', updated);
            }
          } else {
            updated = await prisma.bakeryToken.findUniqueOrThrow({ where: { id: updated.id }, include: { items: { include: { menuItem: true } }, payments: true, customer: true } });
            emitToRestaurant(restaurantId, 'token_updated', updated);
          }
        } catch (err: any) {
          (app as any).log.warn({ err }, 'Retroactive loyalty awarding failed (subpos)');
        }
      }

      return { success: true, data: updated };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err?.message });
    }
  });

  // ── GET /api/subpos/tokens-today ── counter for today
  app.get('/tokens-today', async (request: any) => {
    const restaurantId: number = request.restaurantId;
    const branchId: number = request.branchId;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const count = await prisma.bakeryToken.count({
      where: { restaurantId, branchId, createdAt: { gte: todayStart } },
    });
    return { success: true, data: { count } };
  });
}
