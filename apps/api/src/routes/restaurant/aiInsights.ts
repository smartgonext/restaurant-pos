import { FastifyInstance } from 'fastify';
import { prisma } from '../../app.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantScope } from '../../middleware/tenantScope.js';

export async function aiInsightsRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate);
  app.addHook('onRequest', tenantScope);

  app.get('/analyze', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    
    // Fetch some basic data for "AI" analysis
    const orders = await prisma.order.findMany({
      where: { restaurantId, status: 'PAID' },
      include: { kots: { include: { items: { include: { menuItem: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    if (orders.length < 5) {
      return { success: true, data: { status: 'INSIDE_DATA', message: 'Not enough data for AI insights yet. Keep selling!' } };
    }

    // Logic for mock AI insights
    // 1. Peak hours (mock)
    // 2. Best selling combos (mock)
    // 3. Recommended price adjustments (mock)
    
    const insights = [
      {
        title: "Popular Combo Detected",
        description: "Customers often order 'Butter Chicken' along with 'Garlic Naan'. Consider creating a combo deal to increase average order value by ~15%.",
        impact: "High",
        type: "revenue"
      },
      {
        title: "Weekend Surge",
        description: "Your sales increase by 40% on Saturday nights. Ensure 2 extra staff members are scheduled for the 7 PM - 10 PM shift.",
        impact: "Medium",
        type: "ops"
      },
      {
        title: "Slow Moving Item",
        description: "'Vegetable Clear Soup' hasn't been ordered in 14 days. You might want to revise its price or replace it with a seasonal special.",
        impact: "Low",
        type: "inventory"
      }
    ];

    return { success: true, data: { status: 'READY', insights } };
  });
}
