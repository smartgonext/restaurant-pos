import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../app.js';
import { subposAuth } from '../../middleware/posAuth.js';
import { getNextTokenNumber } from '../../utils/tokenCounter.js';
import { recalculateTokenTotals } from '../../utils/taxCalculator.js';
import { emitToRestaurant } from '../../plugins/socket.js';

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

  // ── POST /api/subpos/token/create ── create new BakeryToken + add initial items
  app.post('/token/create', async (request: any, reply: any) => {
    const restaurantId: number = request.restaurantId;
    const branchId: number = request.branchId;
    const terminalName: string = request.user?.username ?? 'Sub POS';
    const groupIds = (request.user?.groupIds as number[]) ?? [];

    const schema = z.object({
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

      // Validate all items belong to accessible groups
      for (const item of body.items) {
        const menuItem = await prisma.menuItem.findFirst({
          where: { id: item.menuItemId, restaurantId },
        });
        if (!menuItem) {
          return reply.status(400).send({ success: false, error: `Item ${item.menuItemId} not found` });
        }
        if (groupIds.length > 0 && menuItem.categoryId && !groupIds.includes(menuItem.categoryId)) {
          return reply.status(403).send({
            success: false,
            error: `Item "${menuItem.name}" is not accessible on this terminal`,
          });
        }
      }

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
                  addedBy: `subpos:${terminalName}`,
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

      const updated = await prisma.bakeryToken.update({
        where: { id: token.id },
        data: { customerName: body.customerName, customerPhone: body.customerPhone, customerId },
      });
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
