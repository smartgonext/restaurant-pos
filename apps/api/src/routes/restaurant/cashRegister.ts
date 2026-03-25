import { FastifyInstance } from 'fastify';
import { prisma } from '../../app.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantScope } from '../../middleware/tenantScope.js';

export async function cashRegisterRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate);
  app.addHook('onRequest', tenantScope);

  // ── Get Current Session ──
  app.get('/session', async (request: any) => {
    const restaurantId = (request as any).restaurantId;

    const register = await prisma.cashRegister.findFirst({
        where: { restaurantId }
    });
    if (!register) return { success: false, error: 'No cash register found' };

    const session = await prisma.cashRegisterSession.findFirst({
      where: {
        registerId: register.id,
        status: 'open',
      }
    });

    return { success: true, data: session };
  });

  // ── Open Session ──
  app.post('/open', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const user = request.user as any;
    const { openingBalance, notes } = request.body as any;

    let register = await prisma.cashRegister.findFirst({
      where: { restaurantId }
    });

    if (!register) {
        // Create a default one if none exists
        const branch = await prisma.branch.findFirst({ where: { restaurantId } });
        if (!branch) return { success: false, error: 'No branch found' };
        register = await prisma.cashRegister.create({
            data: {
                restaurantId,
                branchId: branch.id,
                name: 'Main Register',
            }
        });
    }

    // Check if a session is already open
    const active = await prisma.cashRegisterSession.findFirst({
      where: { registerId: register.id, status: 'open' }
    });
    if (active) return { success: false, error: 'A session is already open' };

    const session = await prisma.cashRegisterSession.create({
      data: {
        registerId: register.id,
        cashierId: user.staffId || 1, // fallback if admin
        openingBalance: Number(openingBalance),
        note: notes,
        status: 'open'
      }
    });

    return { success: true, data: session };
  });

  // ── Close Session ──
  app.post('/close', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const user = request.user as any;
    const { closingBalance, notes } = request.body as any;

    const register = await prisma.cashRegister.findFirst({
        where: { restaurantId }
    });
    if (!register) return { success: false, error: 'No cash register found' };

    const session = await prisma.cashRegisterSession.findFirst({
      where: { registerId: register.id, status: 'open' }
    });
    if (!session) return { success: false, error: 'No open session found' };

    // Calculate expected balance
    const cashPayments = await prisma.orderPayment.aggregate({
      where: {
        order: { restaurantId },
        method: 'cash',
        createdAt: { gte: session.openedAt }
      },
      _sum: { amount: true }
    });

    const expectedCash = Number(session.openingBalance) + (Number(cashPayments._sum.amount) || 0);

    const updated = await prisma.cashRegisterSession.update({
      where: { id: session.id },
      data: {
        closingBalance: Number(closingBalance),
        expectedCash,
        countedCash: Number(closingBalance),
        discrepancy: Number(closingBalance) - expectedCash,
        note: notes,
        closedAt: new Date(),
        status: 'closed'
      }
    });

    return { success: true, data: updated };
  });

  // ── Get History ──
  app.get('/history', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const register = await prisma.cashRegister.findFirst({
        where: { restaurantId }
    });
    if (!register) return { success: true, data: [] };

    const sessions = await prisma.cashRegisterSession.findMany({
      where: { registerId: register.id },
      orderBy: { openedAt: 'desc' },
      take: 20
    });
    return { success: true, data: sessions };
  });
}
