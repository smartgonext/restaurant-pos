import { FastifyInstance } from 'fastify';
import { prisma } from '../../app.js';

export async function deliveryExecutiveRoutes(app: FastifyInstance) {
  app.get('/', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const executives = await prisma.deliveryExecutive.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
    });
    return { success: true, data: executives };
  });

  app.post('/', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const body = request.body as any;
    const executive = await prisma.deliveryExecutive.create({
      data: { ...body, restaurantId },
    });
    return { success: true, data: executive };
  });

  app.put('/:id', async (request: any) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const executive = await prisma.deliveryExecutive.update({
      where: { id: Number(id) },
      data: body,
    });
    return { success: true, data: executive };
  });

  app.delete('/:id', async (request: any) => {
    const { id } = request.params as { id: string };
    await prisma.deliveryExecutive.delete({ where: { id: Number(id) } });
    return { success: true, message: 'Executive deleted' };
  });
}
