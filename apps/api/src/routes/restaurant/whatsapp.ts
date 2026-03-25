import { FastifyInstance } from 'fastify';
import { prisma } from '../../app.js';

export async function whatsappRoutes(app: FastifyInstance) {
  // Get WhatsApp Settings
  app.get('/config', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const settings = await prisma.restaurantSettings.findUnique({
      where: { restaurantId },
      select: { whatsappEnabled: true, whatsappToken: true }
    });
    return { success: true, data: settings };
  });

  // Update WhatsApp Settings
  app.put('/config', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const { enabled, token } = request.body as any;
    const settings = await prisma.restaurantSettings.update({
      where: { restaurantId },
      data: { whatsappEnabled: enabled, whatsappToken: token }
    });
    return { success: true, data: settings };
  });

  // Test WhatsApp Message
  app.post('/test', async (request: any) => {
    const { phone, message } = request.body as any;
    // Mock sending WhatsApp message
    console.log(`Sending WhatsApp to ${phone}: ${message}`);
    return { success: true, message: 'Test message sent (mock)' };
  });

  // Webhooks Configuration
  app.get('/webhooks', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const settings = await prisma.restaurantSettings.findUnique({
      where: { restaurantId },
      select: { webhookUrls: true }
    });
    return { success: true, data: settings?.webhookUrls || [] };
  });

  app.put('/webhooks', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const { urls } = request.body as any;
    const settings = await prisma.restaurantSettings.update({
      where: { restaurantId },
      data: { webhookUrls: urls }
    });
    return { success: true, data: settings.webhookUrls };
  });
}
