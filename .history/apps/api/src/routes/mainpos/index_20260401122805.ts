import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../app.js';
import { mainposAuth } from '../../middleware/posAuth.js';
import { getNextTokenNumber } from '../../utils/tokenCounter.js';
import { recalculateTokenTotals } from '../../utils/taxCalculator.js';
import { emitToRestaurant } from '../../plugins/socket.js';

export async function mainposRoutes(app: FastifyInstance) {
  // ── POST /api/mainpos/login ── (no auth required)
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
        return reply.status(400).send({ success: false, error: 'terminalCode/username and pin/password are required' });
      }
      const terminal = await prisma.mainPOSTerminal.findUnique({ where: { terminalCode } });
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
          type: 'mainpos',
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
          },
        },
      };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err?.message });
    }
  });

  // All routes below require Main POS auth
  app.addHook('onRequest', mainposAuth);

  // ── GET /api/mainpos/loyalty-config ──
  app.get('/loyalty-config', async (request: any, reply: any) => {
    const restaurantId: number = request.restaurantId;
    const config = await prisma.loyaltyProgram.findUnique({
      where: { restaurantId },
    });
    return { success: true, data: config };
  });

  // ── GET /api/mainpos/items ── all items (Main POS sees everything)
  app.get('/items', async (request: any) => {
    const restaurantId: number = request.restaurantId;
    const items = await prisma.menuItem.findMany({
      where: { restaurantId, isAvailable: true },
      include: { category: true },
      orderBy: [{ categoryId: 'asc' }, { sortOrder: 'asc' }],
    });
    return { success: true, data: items };
  });

  // ── GET /api/mainpos/customers ──
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

  // ── GET /api/mainpos/categories ── all categories
  app.get('/categories', async (request: any) => {
    const restaurantId: number = request.restaurantId;
    const categories = await prisma.itemCategory.findMany({
      where: { restaurantId },
      orderBy: { sortOrder: 'asc' },
    });
    return { success: true, data: categories };
  });

  // ── POST /api/mainpos/token/lookup ── find token by QR or number
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

  // ── GET /api/mainpos/token/:qr ── full token details
  app.get('/token/:qr', async (request: any, reply: any) => {
    const restaurantId: number = request.restaurantId;
    const { qr } = request.params as { qr: string };
    const token = await prisma.bakeryToken.findFirst({
      where: { qrCode: qr, restaurantId },
      include: {
        items: { include: { menuItem: true } },
        payments: true,
        edits: true,
        customer: true,
      },
    });
    if (!token) return reply.status(404).send({ success: false, error: 'Token not found' });
    return { success: true, data: token };
  });

  // ── POST /api/mainpos/token/create ──
  app.post('/token/create', async (request: any, reply: any) => {
    const restaurantId: number = request.restaurantId;
    const branchId: number = request.branchId;
    const terminalName: string = request.user?.username ?? 'Main POS';

    const schema = z.object({
      items: z.array(z.object({ menuItemId: z.number(), quantity: z.number().min(1) })).min(1),
      customerName: z.string().optional(),
      customerPhone: z.string().optional(),
    });

    try {
      const body = schema.parse(request.body);

      // Validate items
      for (const item of body.items) {
        const menuItem = await prisma.menuItem.findFirst({ where: { id: item.menuItemId, restaurantId } });
        if (!menuItem) return reply.status(400).send({ success: false, error: `Item ${item.menuItemId} not found` });
      }

      const tokenNumber = await getNextTokenNumber(restaurantId, branchId, prisma);
      const qrCode = uuidv4();

      let customerId: number | undefined;
      if (body.customerPhone) {
        const existing = await prisma.customer.findFirst({ where: { restaurantId, phone: body.customerPhone } });
        if (existing) customerId = existing.id;
        else if (body.customerName) {
          const newCustomer = await prisma.customer.create({
            data: { restaurantId, name: body.customerName, phone: body.customerPhone },
          });
          customerId = newCustomer.id;
        }
      }

      const token = await prisma.bakeryToken.create({
        data: {
          restaurantId,
          branchId,
          tokenNumber,
          qrCode,
          customerName: body.customerName,
          customerPhone: body.customerPhone,
          customerId,
          items: {
            create: await Promise.all(
              body.items.map(async (i) => {
                const mi = await prisma.menuItem.findUnique({ where: { id: i.menuItemId } });
                return {
                  menuItemId: i.menuItemId,
                  menuItemName: mi?.name ?? 'Unknown',
                  price: mi?.price ?? 0,
                  quantity: i.quantity,
                  total: Number(mi?.price ?? 0) * i.quantity,
                  addedBy: `mainpos:${terminalName}`,
                };
              }),
            ),
          },
        },
        include: { items: true },
      });

      await recalculateTokenTotals(token.id, prisma);
      const updated = await prisma.bakeryToken.findUnique({
        where: { id: token.id },
        include: { items: { where: { isRemoved: false } }, payments: true },
      });

      emitToRestaurant(restaurantId, 'token_created', { tokenId: token.id, tokenNumber, branchId });

      return { success: true, data: updated };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err?.message });
    }
  });

  // ── POST /api/mainpos/token/:qr/items/bulk ── add multiple items
  app.post('/token/:qr/items/bulk', async (request: any, reply: any) => {
    const restaurantId: number = request.restaurantId;
    const { qr } = request.params as { qr: string };
    const terminalName: string = request.user?.username ?? 'Main POS';

    const schema = z.object({
      items: z.array(z.object({ menuItemId: z.number(), quantity: z.number().min(1) })).min(1),
    });

    try {
      const body = schema.parse(request.body);
      const token = await prisma.bakeryToken.findFirst({ where: { qrCode: qr, restaurantId } });
      if (!token) return reply.status(404).send({ success: false, error: 'Token not found' });
      if (token.status === 'paid' || token.status === 'cancelled') {
        return reply.status(400).send({ success: false, error: 'Token is already closed' });
      }

      const itemsToCreate = [];
      for (const i of body.items) {
        const mi = await prisma.menuItem.findFirst({ where: { id: i.menuItemId, restaurantId } });
        if (mi) {
          itemsToCreate.push({
            tokenId: token.id,
            menuItemId: i.menuItemId,
            menuItemName: mi.name,
            price: mi.price,
            quantity: i.quantity,
            total: Number(mi.price) * i.quantity,
            addedBy: `mainpos:${terminalName}`,
          });
        }
      }

      if (itemsToCreate.length > 0) {
        await prisma.bakeryTokenItem.createMany({ data: itemsToCreate });
      }

      await recalculateTokenTotals(token.id, prisma);
      const updated = await prisma.bakeryToken.findUnique({
        where: { id: token.id },
        include: { items: { include: { menuItem: true } }, payments: true },
      });
      emitToRestaurant(restaurantId, 'token_updated', updated);
      return { success: true, data: updated };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err?.message });
    }
  });

  // ── POST /api/mainpos/token/:qr/items ── add item to token
  app.post('/token/:qr/items', async (request: any, reply: any) => {
    // TODO: implement adding item to token
    return reply.status(501).send({ success: false, error: 'Not implemented' });
  });

  // ── POST /api/mainpos/token/:qr/merge-order ── Waiter merges table order
  app.post('/token/:qr/merge-order', async (request: any, reply: any) => {
    const restaurantId: number = request.restaurantId;
    const { qr } = request.params as { qr: string };
    const terminalName: string = request.user?.username ?? 'System';

    const schema = z.object({ orderId: z.number() });
    try {
      const { orderId } = schema.parse(request.body);
      
      const token = await prisma.bakeryToken.findFirst({ where: { qrCode: qr, restaurantId } });
      if (!token || token.status === 'paid' || token.status === 'cancelled') {
        return reply.status(400).send({ success: false, error: 'Invalid or closed token' });
      }

      const order = await prisma.order.findUnique({
        where: { id: orderId, restaurantId },
        include: { kots: { include: { items: { include: { menuItem: true } } } } }
      });
      if (!order) return reply.status(404).send({ success: false, error: 'Order not found' });

      // Extract all valid kot items
      const newItems: any[] = [];
      for (const kot of order.kots) {
        for (const item of kot.items) {
          if (item.status !== 'cancelled') {
            newItems.push({
              tokenId: token.id,
              menuItemId: item.menuItemId,
              menuItemName: item.menuItem.name,
              price: item.price,
              quantity: item.quantity,
              total: Number(item.price) * item.quantity,
              addedBy: `waiter:${order.tableId || orderId}`,
            });
          }
        }
      }

      await prisma.$transaction(async (tx: any) => {
        if (newItems.length > 0) {
          await tx.bakeryTokenItem.createMany({ data: newItems });
        }
        await tx.order.update({
          where: { id: order.id },
          data: { status: 'merged_to_token' },
        });
        if (order.tableId) {
          await tx.table.update({ where: { id: order.tableId }, data: { status: 'available' } });
        }
      });

      await recalculateTokenTotals(token.id, prisma);
      const updated = await prisma.bakeryToken.findUnique({
        where: { id: token.id },
        include: { items: { include: { menuItem: true } }, payments: true },
      });
      emitToRestaurant(restaurantId, 'token_updated', updated);
      emitToRestaurant(restaurantId, 'order_updated', { orderId: order.id, status: 'merged_to_token' });
      
      return { success: true, data: updated };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err?.message });
    }
  });

  // ── DELETE /api/mainpos/token/:qr/items/:itemId ── soft-delete with password + reason
  app.delete('/token/:qr/items/:itemId', async (request: any, reply: any) => {
    const restaurantId: number = request.restaurantId;
    const { qr, itemId } = request.params as { qr: string; itemId: string };
    const terminalName: string = request.user?.username ?? 'Main POS';

    const schema = z.object({
      adminPassword: z.string().min(1),
      reason: z.string().min(1),
    });

    try {
      const body = schema.parse(request.body);

      // Verify POS delete password
      const settings = await prisma.restaurantSettings.findFirst({ where: { restaurantId } });
      if (!(settings as any)?.posDeletePassword) {
        return reply.status(403).send({ success: false, error: 'POS delete password not configured' });
      }
      const isValid = await bcrypt.compare(body.adminPassword, (settings as any).posDeletePassword);
      if (!isValid) return reply.status(403).send({ success: false, error: 'Incorrect password' });

      const token = await prisma.bakeryToken.findFirst({ where: { qrCode: qr, restaurantId } });
      if (!token) return reply.status(404).send({ success: false, error: 'Token not found' });

      const item = await prisma.bakeryTokenItem.findFirst({
        where: { id: Number(itemId), tokenId: token.id, isRemoved: false },
      });
      if (!item) return reply.status(404).send({ success: false, error: 'Item not found or already removed' });

      // Soft delete only
      await prisma.bakeryTokenItem.update({
        where: { id: item.id },
        data: { isRemoved: true, removedAt: new Date(), removedBy: terminalName, removeReason: body.reason },
      });

      // Log edit
      await prisma.auditLog.create({
        data: {
          restaurantId,
          branchId: token.branchId,
          action: 'DELETE_ITEM',
          reason: body.reason,
          referenceId: token.tokenNumber.toString(),
          details: {
            tokenId: token.id,
            menuItemName: item.menuItemName,
            oldQty: item.quantity,
            newQty: 0,
            staffUsername: terminalName,
          },
        },
      });

      await recalculateTokenTotals(token.id, prisma);
      const updated = await prisma.bakeryToken.findUnique({
        where: { id: token.id },
        include: { items: { include: { menuItem: true } }, payments: true },
      });
      emitToRestaurant(restaurantId, 'token_updated', updated);
      return { success: true, data: updated };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err?.message });
    }
  });

  // ── PUT /api/mainpos/token/:qr/items/:itemId ── edit quantity with password + reason
  app.put('/token/:qr/items/:itemId', async (request: any, reply: any) => {
    const restaurantId: number = request.restaurantId;
    const { qr, itemId } = request.params as { qr: string; itemId: string };
    const terminalName: string = request.user?.username ?? 'Main POS';

    const schema = z.object({
      quantity: z.number().min(1),
      adminPassword: z.string().min(1),
      reason: z.string().min(1),
    });

    try {
      const body = schema.parse(request.body);

      const settings = await prisma.restaurantSettings.findFirst({ where: { restaurantId } });
      if (!(settings as any)?.posDeletePassword) {
        return reply.status(403).send({ success: false, error: 'POS delete password not configured' });
      }
      const isValid = await bcrypt.compare(body.adminPassword, (settings as any).posDeletePassword);
      if (!isValid) return reply.status(403).send({ success: false, error: 'Incorrect password' });

      const token = await prisma.bakeryToken.findFirst({ where: { qrCode: qr, restaurantId } });
      if (!token) return reply.status(404).send({ success: false, error: 'Token not found' });

      const item = await prisma.bakeryTokenItem.findFirst({
        where: { id: Number(itemId), tokenId: token.id, isRemoved: false },
      });
      if (!item) return reply.status(404).send({ success: false, error: 'Item not found' });

      const oldQty = item.quantity;
      const newTotal = Number(item.price) * body.quantity;

      await prisma.bakeryTokenItem.update({
        where: { id: item.id },
        data: { quantity: body.quantity, total: newTotal },
      });

      await prisma.auditLog.create({
        data: {
          restaurantId,
          branchId: token.branchId,
          action: 'EDIT_ITEM_QTY',
          reason: body.reason,
          referenceId: token.tokenNumber.toString(),
          details: {
            tokenId: token.id,
            menuItemName: item.menuItemName,
            oldQty: oldQty,
            newQty: body.quantity,
            staffUsername: terminalName,
          },
        },
      });

      await recalculateTokenTotals(token.id, prisma);
      const updated = await prisma.bakeryToken.findUnique({
        where: { id: token.id },
        include: { items: { include: { menuItem: true } }, payments: true },
      });
      emitToRestaurant(restaurantId, 'token_updated', updated);
      return { success: true, data: updated };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err?.message });
    }
  });

  // ── POST /api/mainpos/token/:qr/customer ── attach customer
  app.post('/token/:qr/customer', async (request: any, reply: any) => {
    const restaurantId: number = request.restaurantId;
    const { qr } = request.params as { qr: string };
    const schema = z.object({
      customerName: z.string().optional(),
      customerPhone: z.string().min(1),
    });
    try {
      const body = schema.parse(request.body);
      const token = await prisma.bakeryToken.findFirst({ where: { qrCode: qr, restaurantId } });
      if (!token) return reply.status(404).send({ success: false, error: 'Token not found' });

      let customerId = token.customerId ?? undefined;
      const existing = await prisma.customer.findFirst({ where: { restaurantId, phone: body.customerPhone } });
      if (existing) {
        customerId = existing.id;
      } else {
        const newC = await prisma.customer.create({
          data: { restaurantId, name: body.customerName || 'Walk-in', phone: body.customerPhone },
        });
        customerId = newC.id;
      }

      const updated = await prisma.bakeryToken.update({
        where: { id: token.id },
        data: {
          customerName: body.customerName || 'Walk-in',
          customerPhone: body.customerPhone,
          customerId,
        },
        include: { items: { include: { menuItem: true } }, payments: true, customer: true },
      });

      emitToRestaurant(restaurantId, 'customer_display_show_bill', {
        tokenId: token.id,
        tokenNumber: token.tokenNumber,
        customerName: updated.customerName,
        total: Number(updated.total),
      });

      return { success: true, data: updated };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err?.message });
    }
  });

  // ── POST /api/mainpos/token/:qr/loyalty/claim ── claim loyalty points for discount
  app.post('/token/:qr/loyalty/claim', async (request: any, reply: any) => {
    const restaurantId: number = request.restaurantId;
    const { qr } = request.params as { qr: string };
    const schema = z.object({
      customerId: z.number(),
      pointsToClaim: z.number().min(1),
    });
    try {
      const body = schema.parse(request.body);
      const token = await prisma.bakeryToken.findFirst({ where: { qrCode: qr, restaurantId } });
      if (!token) return reply.status(404).send({ success: false, error: 'Token not found' });

      const customer = await prisma.customer.findUnique({ where: { id: body.customerId } });
      if (!customer) return reply.status(404).send({ success: false, error: 'Customer not found' });
      if (customer.loyaltyPoints < body.pointsToClaim) {
        return reply.status(400).send({ success: false, error: 'Insufficient loyalty points' });
      }

      const loyaltyProgram = await prisma.loyaltyProgram.findFirst({ where: { restaurantId } });
      if (!loyaltyProgram || !loyaltyProgram.isActive) {
        return reply.status(400).send({ success: false, error: 'Loyalty program is disabled' });
      }

      if (body.pointsToClaim < Number(loyaltyProgram.minClaimPoints || 0)) {
        return reply.status(400).send({ success: false, error: `Minimum ${loyaltyProgram.minClaimPoints} points required to redeem` });
      }

      const pointValue = Number((loyaltyProgram as any)?.pointValue ?? 0.5);
      const discount = Math.round(body.pointsToClaim * pointValue * 100) / 100;

      const maxClaimPercent = Number(loyaltyProgram.maxClaimPercent || 100);
      const maxDiscountValue = (Number(token.total) * maxClaimPercent) / 100;
      
      if (discount > maxDiscountValue) {
        return reply.status(400).send({ success: false, error: `Maximum redemption allowed is ${maxClaimPercent}% of the bill (₹${maxDiscountValue.toFixed(2)})` });
      }

      await prisma.bakeryToken.update({
        where: { id: token.id },
        data: {
          discountApplied: { increment: discount },
          loyaltyPointsClaimed: { increment: body.pointsToClaim },
          customerId: body.customerId,
        },
      });

      await prisma.customer.update({
        where: { id: body.customerId },
        data: { loyaltyPoints: { decrement: body.pointsToClaim } },
      });

      if (loyaltyProgram) {
        await prisma.loyaltyTransaction.create({
          data: {
            customerId: body.customerId,
            restaurantId,
            loyaltyProgramId: loyaltyProgram.id,
            type: 'redeemed',
            points: -body.pointsToClaim,
            note: `Token #${token.tokenNumber}`,
          },
        });
      }

      await recalculateTokenTotals(token.id, prisma);
      const updated = await prisma.bakeryToken.findUnique({
        where: { id: token.id },
        include: { items: { include: { menuItem: true } }, payments: true },
      });
      return { success: true, data: updated };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err?.message });
    }
  });

  // ── POST /api/mainpos/token/:qr/customer ── attach customer to token
  app.post('/token/:qr/customer', async (request: any, reply: any) => {
    const restaurantId: number = request.restaurantId;
    const { qr } = request.params as { qr: string };
    const schema = z.object({
      customerName: z.string().optional(),
      customerPhone: z.string().min(1),
    });
    try {
      const body = schema.parse(request.body);
      const token = await prisma.bakeryToken.findFirst({ where: { qrCode: qr, restaurantId } });
      if (!token) return reply.status(404).send({ success: false, error: 'Token not found' });

      let customerId = token.customerId ?? undefined;
      const existing = await prisma.customer.findFirst({ where: { restaurantId, phone: body.customerPhone } });
      if (existing) {
        customerId = existing.id;
      } else {
        const newC = await prisma.customer.create({
          data: { restaurantId, name: body.customerName || 'Walk-in', phone: body.customerPhone },
        });
        customerId = newC.id;
      }

      const updated = await prisma.bakeryToken.update({
        where: { id: token.id },
        data: { customerName: body.customerName || 'Walk-in', customerPhone: body.customerPhone, customerId },
        include: { items: { include: { menuItem: true } }, payments: true, customer: true },
      });
      return { success: true, data: updated };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err?.message });
    }
  });

  // ── POST /api/mainpos/token/:qr/payment ── record payment, mark paid, award loyalty
  app.post('/token/:qr/payment', async (request: any, reply: any) => {
    const restaurantId: number = request.restaurantId;
    const { qr } = request.params as { qr: string };
    const schema = z.object({
      method: z.enum(['cash', 'gpay', 'card', 'upi', 'other']),
      amount: z.number().positive(),
      transactionId: z.string().optional(),
    });
    try {
      const body = schema.parse(request.body);
      const token = await prisma.bakeryToken.findFirst({
        where: { qrCode: qr, restaurantId },
        include: { items: { where: { isRemoved: false } } },
      });
      if (!token) return reply.status(404).send({ success: false, error: 'Token not found' });
      if (token.status === 'paid') return reply.status(400).send({ success: false, error: 'Already paid' });

      await prisma.bakeryTokenPayment.create({
        data: { tokenId: token.id, method: body.method, amount: body.amount, transactionId: body.transactionId },
      });

      const totalPaidAgg = await prisma.bakeryTokenPayment.aggregate({
        where: { tokenId: token.id },
        _sum: { amount: true },
      });
      const totalPaid = Number(totalPaidAgg._sum.amount ?? 0);
      const tokenTotal = Number(token.total);

      let pointsEarned = 0;

      if (totalPaid >= tokenTotal) {
        // Mark as fully paid
        await prisma.bakeryToken.update({
          where: { id: token.id },
          data: { status: 'paid', paidAt: new Date() },
        });

        // Award loyalty points if customer linked
        if (token.customerId) {
          const loyaltyProgram = await prisma.loyaltyProgram.findFirst({ where: { restaurantId } });
          if (loyaltyProgram && loyaltyProgram.isActive) {
            const pointsPerRupee = Number((loyaltyProgram as any)?.pointsPerRupee ?? 0.1);
            pointsEarned = Math.floor(tokenTotal * pointsPerRupee);

            if (pointsEarned > 0) {
              await prisma.customer.update({
                where: { id: token.customerId },
                data: { loyaltyPoints: { increment: pointsEarned } },
              });
              await prisma.loyaltyTransaction.create({
                data: {
                  customerId: token.customerId,
                  restaurantId,
                  loyaltyProgramId: loyaltyProgram.id,
                  type: 'earned',
                  points: pointsEarned,
                  note: `Token #${token.tokenNumber}`,
                },
              });
              await prisma.bakeryToken.update({
                where: { id: token.id },
                data: { loyaltyPointsEarned: pointsEarned },
              });
            }
          }
        }

        // Auto-deduct stock (fire and forget — errors logged, not surfaced)
        deductStockForToken(token.id, restaurantId, prisma).catch(console.error);

        emitToRestaurant(restaurantId, 'token_paid', { tokenId: token.id, tokenNumber: token.tokenNumber });
        emitToRestaurant(restaurantId, 'customer_display_payment_ok', {
          customerName: token.customerName,
          pointsEarned,
        });
      } else {
        // Partial payment
        await prisma.bakeryToken.update({ where: { id: token.id }, data: { status: 'partial_paid' } });
      }

      const updated = await prisma.bakeryToken.findUnique({
        where: { id: token.id },
        include: { items: true, payments: true },
      });
      return { success: true, data: { token: updated, totalPaid, pointsEarned } };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err?.message });
    }
  });

  // ── GET /api/mainpos/recent-tokens ── last 20 tokens for this branch
  app.get('/recent-tokens', async (request: any) => {
    const restaurantId: number = request.restaurantId;
    const branchId: number = request.branchId;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const tokens = await prisma.bakeryToken.findMany({
      where: { restaurantId, branchId, createdAt: { gte: todayStart } },
      orderBy: { tokenNumber: 'desc' },
      take: 20,
      select: { id: true, tokenNumber: true, qrCode: true, status: true, total: true, customerName: true, createdAt: true },
    });
    return { success: true, data: tokens };
  });
}

// ── Stock auto-deduction (internal, not exported as route) ──
async function deductStockForToken(tokenId: number, restaurantId: number, prisma: any): Promise<void> {
  const token = await prisma.bakeryToken.findUnique({
    where: { id: tokenId },
    include: { items: { where: { isRemoved: false } } },
  });
  if (!token) return;

  await prisma.$transaction(async (tx: any) => {
    for (const tokenItem of token.items) {
      const recipe = await tx.recipe.findUnique({
        where: { menuItemId: tokenItem.menuItemId },
        include: { ingredients: true },
      });
      if (!recipe) continue;
      for (const ingredient of recipe.ingredients) {
        const deductQty = Number(ingredient.quantity) * tokenItem.quantity;
        await tx.inventoryItem.update({
          where: { id: ingredient.inventoryItemId },
          data: { currentStock: { decrement: deductQty } },
        });
        await tx.inventoryMovement.create({
          data: {
            restaurantId,
            itemId: ingredient.inventoryItemId,
            type: 'out',
            quantity: deductQty,
            note: `Token #${token.tokenNumber}`,
          },
        });
      }
    }
  });
}
