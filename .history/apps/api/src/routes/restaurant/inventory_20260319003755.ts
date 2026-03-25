import { FastifyInstance } from 'fastify';
import { prisma } from '../../app.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantScope } from '../../middleware/tenantScope.js';

export async function inventoryRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate);
  app.addHook('onRequest', tenantScope);

  // --- Items ---
  app.get('/items', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const items = await prisma.inventoryItem.findMany({
      where: { restaurantId },
      include: { category: true, unit: true }
    });
    return { success: true, data: items };
  });

  app.post('/items', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const body = request.body as any;
    const item = await prisma.inventoryItem.create({
      data: { ...body, restaurantId }
    });
    return { success: true, data: item };
  });

  // --- Categories ---
  app.get('/categories', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const categories = await prisma.inventoryItemCategory.findMany({
      where: { restaurantId }
    });
    return { success: true, data: categories };
  });

  // --- Units ---
  app.get('/units', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const units = await prisma.inventoryUnit.findMany({
      where: { restaurantId }
    });
    return { success: true, data: units };
  });

  // --- Suppliers ---
  app.get('/suppliers', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const suppliers = await prisma.supplier.findMany({
      where: { restaurantId }
    });
    return { success: true, data: suppliers };
  });

  app.post('/suppliers', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const body = request.body as any;
    const supplier = await prisma.supplier.create({
      data: { ...body, restaurantId }
    });
    return { success: true, data: supplier };
  });

  // --- Recipes ---
  app.get('/recipes', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const recipes = await prisma.recipe.findMany({
      where: { restaurantId },
      include: { 
        ingredients: { 
          include: { inventoryItem: true } 
        }
      }
    });
    return { success: true, data: recipes };
  });

  // --- Movements ---
  app.get('/movements', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const movements = await prisma.inventoryMovement.findMany({
      where: { restaurantId },
      include: { item: true },
      orderBy: { createdAt: 'desc' }
    });
    return { success: true, data: movements };
  });
}
