import { FastifyInstance } from 'fastify';
import { prisma } from '../../app.js';

export async function loyaltyRoutes(app: FastifyInstance) {
  // Get Loyalty Program Settings
  app.get('/program', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const program = await prisma.loyaltyProgram.findUnique({
      where: { restaurantId },
    });
    return { success: true, data: program };
  });

  // Update Loyalty Program Settings
  app.put('/program', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const body = request.body as any;
    const program = await prisma.loyaltyProgram.upsert({
      where: { restaurantId },
      update: body,
      create: { ...body, restaurantId },
    });
    return { success: true, data: program };
  });

  // Get Loyalty Transactions
  app.get('/transactions', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const { customerId } = request.query as any;
    const where: any = { restaurantId };
    if (customerId) where.customerId = Number(customerId);

    const transactions = await prisma.loyaltyTransaction.findMany({
      where,
      include: { customer: true },
      orderBy: { createdAt: 'desc' },
    });
    return { success: true, data: transactions };
  });

  // Add points/stamps manually
  app.post('/transactions', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const body = request.body as any;

    const program = await prisma.loyaltyProgram.findUnique({ where: { restaurantId } });
    if (!program) return { success: false, error: 'Loyalty program not active' };

    const transaction = await prisma.$transaction(async (tx: any) => {
      const txn = await tx.loyaltyTransaction.create({
        data: {
          ...body,
          restaurantId,
          loyaltyProgramId: program.id,
        },
      });

      // Update customer totals
      await tx.customer.update({
        where: { id: body.customerId },
        data: {
          loyaltyPoints: { increment: body.points || 0 },
          loyaltyStamps: { increment: body.stamps || 0 },
        },
      });

      return txn;
    });

    return { success: true, data: transaction };
  });
}
