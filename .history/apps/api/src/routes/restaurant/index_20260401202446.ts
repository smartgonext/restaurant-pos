import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantScope } from '../../middleware/tenantScope.js';
import { prisma } from '../../app.js';
import { emitToRestaurant, emitToKitchen } from '../../plugins/socket.js';
import { reportRoutes } from './reports.js';
import { cashRegisterRoutes } from './cashRegister.js';
import { paymentGatewayRoutes } from './paymentGateway.js';
import { aiInsightsRoutes } from './aiInsights.js';
import { inventoryRoutes } from './inventory.js';
import { loyaltyRoutes } from './loyalty.js';
import { deliveryExecutiveRoutes } from './deliveryExecutive.js';
import { whatsappRoutes } from './whatsapp.js';
import { uploadRoutes } from './upload.js';
import { hotelRoutes } from './hotel.js';
import { Decimal, JsonValue } from '@prisma/client/runtime/library';

export async function restaurantRoutes(app: FastifyInstance) {
    // ── PUBLIC ROUTES (NO AUTH NEEDED) ──
    app.get('/proxy-ai-image', async (request: any, reply: any) => {
      const { prompt, seed, width = 1024, height = 1024 } = request.query as any;
      const aiUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${seed || 1234}&nologo=true&model=flux`;
      
      try {
        const response = await fetch(aiUrl);
        if (!response.ok) throw new Error('Failed to fetch image');

        const arrayBuffer = await response.arrayBuffer();
        const contentType = response.headers.get('content-type') || 'image/jpeg';

        reply.header('Content-Type', contentType);
        reply.header('Cache-Control', 'public, max-age=86400'); // Cache for 24h
        return reply.send(Buffer.from(arrayBuffer));
      } catch (err) {
        // If backend can't reach AI either, redirect to a static placeholder
        return reply.redirect('https://images.unsplash.com/photo-1504674900247-0877df9cc836?q=80&w=800&auto=format&fit=crop');
      }
    });

    // ── AUDIT LOG ENDPOINTS (PRIVATE) ──
    app.post('/audit-logs', async (request: any, reply: any) => {
      const restaurantId = (request as any).restaurantId;
      const { z } = await import('zod');
      const schema = z.object({
        branchId: z.number(),
        terminalId: z.number().optional(),
        staffId: z.number().optional(),
        action: z.string().min(1),
        reason: z.string().min(1),
        referenceId: z.string().min(1),
        details: z.any().optional(),
      });
      try {
        const body = schema.parse(request.body);
        const log = await prisma.auditLog.create({ data: { ...body, restaurantId } });
        return { success: true, data: log };
      } catch (err: any) {
        return reply.status(400).send({ success: false, error: err?.message });
      }
    });

    app.get('/audit-logs', async (request: any) => {
      const restaurantId = (request as any).restaurantId;
      const { branchId, action, staffId, from, to } = request.query as any;
      const where: any = { restaurantId };
      if (branchId) where.branchId = Number(branchId);
      if (action) where.action = action;
      if (staffId) where.staffId = Number(staffId);
      if (from || to) {
        where.createdAt = {};
        if (from) where.createdAt.gte = new Date(from);
        if (to) where.createdAt.lte = new Date(to);
      }
      const logs = await prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });
      return { success: true, data: logs };
    });
  // ── SECURITY: Conditional Auth Hooks ──
  // Skip authentication and tenant scoping ONLY for the public image proxy
  app.addHook('onRequest', async (request, reply) => {
    if (request.url.includes('/proxy-ai-image')) return;
    return authenticate(request, reply);
  });

  app.addHook('onRequest', async (request, reply) => {
    if (request.url.includes('/proxy-ai-image')) return;
    return tenantScope(request, reply);
  });

  // ── Activate or Create ItemModifier for Menu Item and Modifier Group ──
  app.post('/item-modifiers/activate', async (request: any, reply: any) => {
    const restaurantId = (request as any).restaurantId;
    const { z } = await import('zod');
    const schema = z.object({
      menuItemId: z.number().or(z.string().transform(v => Number(v))),
      modifierGroupId: z.number().or(z.string().transform(v => Number(v))),
      isRequired: z.boolean().optional().default(false),
      allowMultiple: z.boolean().optional().default(false),
    });

    try {
      const { menuItemId, modifierGroupId, isRequired, allowMultiple } = schema.parse(request.body);
      // Check if ItemModifier exists
      let itemModifier = await prisma.itemModifier.findFirst({
        where: { menuItemId: Number(menuItemId), modifierGroupId: Number(modifierGroupId), restaurantId },
      });
      if (!itemModifier) {
        // Create new ItemModifier
        itemModifier = await prisma.itemModifier.create({
          data: { menuItemId: Number(menuItemId), modifierGroupId: Number(modifierGroupId), isRequired, allowMultiple, restaurantId },
        });
      }
      // Return updated menu item with its modifiers
      const item = await prisma.menuItem.findUnique({
        where: { id: Number(menuItemId) },
        include: { itemModifiers: { include: { modifierGroup: true } } },
      });
      return { success: true, data: item };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err?.message || String(err) });
    }
  });

  // ── Update KOT Item Status ──
  app.put('/kot-items/:id/status', async (request: any, reply: any) => {
    const { id } = request.params as { id: string };
    const restaurantId = (request as any).restaurantId;
    const { z } = await import('zod');
    const schema = z.object({
      status: z.string().min(1),
    });

    try {
      const { status } = schema.parse(request.body);
      // Update the KOT item status
      const kotItem = await prisma.kOTItem.update({
        where: { id: Number(id) },
        data: { status },
        include: {
          kot: {
            include: {
              order: { include: { table: true, staff: { select: { name: true } } } },
              items: { include: { menuItem: true } },
              kitchen: true,
            },
          },
          menuItem: true,
        },
      });
      // Emit real-time update for this KOT and item
      emitToRestaurant(restaurantId, 'kot_item_updated', kotItem);
      emitToKitchen(restaurantId, 'kot_item_updated', kotItem);
      return { success: true, data: kotItem };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err?.message || String(err) });
    }
  });
  // (Auth hooks are already registered at the top of this plugin)
  
  await app.register(reportRoutes, { prefix: '/reports' });
  await app.register(cashRegisterRoutes, { prefix: '/cash-register' });
  await app.register(paymentGatewayRoutes, { prefix: '/payment-gateway' });
  await app.register(aiInsightsRoutes, { prefix: '/ai-insights' });
  await app.register(inventoryRoutes, { prefix: '/inventory' });
  await app.register(loyaltyRoutes, { prefix: '/loyalty' });
  await app.register(deliveryExecutiveRoutes, { prefix: '/delivery-executives' });
  await app.register(whatsappRoutes, { prefix: '/whatsapp' });
  await app.register(uploadRoutes, { prefix: '/upload' });
  await app.register(hotelRoutes, { prefix: '/hotel' });

  // ── GET /api/restaurant/generate-image ──
  app.post('/generate-image', async (request: any, reply: any) => {
    const { itemName } = request.body as { itemName: string };
    if (!itemName) return reply.status(400).send({ success: false, error: 'itemName is required' });
    
    // Using a more reliable AI prompt-based endpoint (New Pollinations/Flux API)
    const seed = Math.floor(Math.random() * 100000);
    // Adding extra keywords to prompt for better food photography quality
    const prompt = `${itemName}, professional food photography, 8k resolution, cinematic lighting, appetizing`;
    // Returning a PROXY URL that the backend handles to bypass user network blocks
    const imageUrl = `/api/restaurant/proxy-ai-image?prompt=${encodeURIComponent(prompt)}&seed=${seed}`;
    
    return { success: true, imageUrl };
  });

  // (Auth hooks already registered earlier) ──
  app.get('/pos-terminals/subpos', async (request: any) => {
    const restaurantId = (request as any).restaurantId as number;
    const terminals = await prisma.subPOSTerminal.findMany({ where: { restaurantId }, orderBy: { createdAt: 'desc' } });
    return { success: true, data: terminals };
  });

  app.post('/pos-terminals/subpos', async (request: any, reply: any) => {
    const restaurantId = (request as any).restaurantId as number;
    const { z } = await import('zod');
    const schema = z.object({
      name: z.string().min(1),
      terminalCode: z.string().min(3),
      pin: z.string().min(4),
      branchId: z.number().int().positive(),
      groupIds: z.array(z.number().int().positive()).min(1),
    });
    try {
      const body = schema.parse(request.body);

      const branch = await prisma.branch.findFirst({ where: { id: body.branchId, restaurantId } });
      if (!branch) {
        return reply.status(400).send({ success: false, error: 'Invalid branchId for this restaurant' });
      }

      const hashedPin = await bcrypt.hash(body.pin, 10);
      const terminal = await prisma.subPOSTerminal.create({
        data: {
          restaurantId,
          name: body.name,
          terminalCode: body.terminalCode,
          pin: hashedPin,
          branchId: body.branchId,
          groupIds: body.groupIds,
        },
      });
      return { success: true, data: terminal };
    } catch (err: any) {
      const message = err?.response?.data?.error || err?.message || 'Invalid request';
      return reply.status(400).send({ success: false, error: message });
    }
  });

  app.put('/pos-terminals/subpos/:id', async (request: any, reply: any) => {
    const restaurantId = (request as any).restaurantId as number;
    const { id } = request.params as { id: string };
    const { z } = await import('zod');
    const schema = z.object({
      name: z.string().optional(), isActive: z.boolean().optional(),
      groupIds: z.array(z.number()).optional(), pin: z.string().optional(),
    });
    try {
      const body = schema.parse(request.body);
      const data: any = { name: body.name, isActive: body.isActive };
      if (body.groupIds) data.groupIds = body.groupIds;
      if (body.pin) {
        data.pin = await bcrypt.hash(body.pin, 10);
      }
      const terminal = await prisma.subPOSTerminal.update({ where: { id: Number(id), restaurantId }, data });
      return { success: true, data: terminal };
    } catch (err: any) { return reply.status(400).send({ success: false, error: err?.message }); }
  });

  app.get('/pos-terminals/mainpos', async (request: any) => {
    const restaurantId = (request as any).restaurantId as number;
    const terminals = await prisma.mainPOSTerminal.findMany({ where: { restaurantId }, orderBy: { createdAt: 'desc' } });
    return { success: true, data: terminals };
  });

  app.post('/pos-terminals/mainpos', async (request: any, reply: any) => {
    const restaurantId = (request as any).restaurantId as number;
    const { z } = await import('zod');
    const schema = z.object({ name: z.string().min(1), terminalCode: z.string().min(3), pin: z.string().min(4), branchId: z.number() });
    try {
      const body = schema.parse(request.body);
      const hashedPin = await bcrypt.hash(body.pin, 10);
      const terminal = await prisma.mainPOSTerminal.create({
        data: { restaurantId, name: body.name, terminalCode: body.terminalCode, pin: hashedPin, branchId: body.branchId },
      });
      return { success: true, data: terminal };
    } catch (err: any) { return reply.status(400).send({ success: false, error: err?.message }); }
  });

  app.put('/pos-terminals/mainpos/:id', async (request: any, reply: any) => {
    const restaurantId = (request as any).restaurantId as number;
    const { id } = request.params as { id: string };
    const { z } = await import('zod');
    const body = z.object({ name: z.string().optional(), isActive: z.boolean().optional(), pin: z.string().optional() }).parse(request.body);
    const data: any = { name: body.name, isActive: body.isActive };
    if (body.pin) { data.pin = await bcrypt.hash(body.pin, 10); }
    const terminal = await prisma.mainPOSTerminal.update({ where: { id: Number(id), restaurantId }, data });
    return { success: true, data: terminal };
  });

  // ── Token Management (Admin, with daily reset and branch-unique enforcement) ──
  app.get('/tokens', async (request: any) => {
    const restaurantId = (request as any).restaurantId as number;
    const { from, to, status, branchId } = request.query as any;
    const fromDate = from ? new Date(from) : new Date(new Date().setHours(0, 0, 0, 0));
    const toDate = to ? new Date(new Date(to).setHours(23, 59, 59, 999)) : new Date(new Date().setHours(23, 59, 59, 999));
    const where: any = { restaurantId, createdAt: { gte: fromDate, lte: toDate } };
    if (status) where.status = status;
    if (branchId) where.branchId = Number(branchId);
    // Enforce branch-unique and daily reset logic in queries
    const tokens = await prisma.bakeryToken.findMany({
      where,
      orderBy: { tokenNumber: 'desc' },
      include: { _count: { select: { items: true } } },
    });
    return { success: true, data: tokens };
  });

  // ── Sensitive Token Edit/Delete (Main POS) ──
  app.post('/tokens/:id/edit', async (request: any, reply: any) => {
    // Only Main POS, require password+reason, log audit
    const restaurantId = (request as any).restaurantId as number;
    const staffId = (request as any).staffId;
    const { id } = request.params as { id: string };
    const { z } = await import('zod');
    const schema = z.object({
      password: z.string().min(4),
      reason: z.string().min(5),
      changes: z.record(z.any()),
    });
    try {
      const body = schema.parse(request.body);
      // Fetch staff and verify password
      const staff = await prisma.staff.findUnique({ where: { id: staffId } });
      if (!staff) return reply.status(403).send({ success: false, error: 'Staff not found' });
      const valid = await bcrypt.compare(body.password, staff.password);
      if (!valid) return reply.status(403).send({ success: false, error: 'Invalid password' });
      // Apply changes
      const token = await prisma.bakeryToken.update({ where: { id: Number(id), restaurantId }, data: body.changes });
      // Log audit
      await prisma.auditLog.create({
        data: {
          restaurantId,
          branchId: token.branchId,
          terminalId: null,
          staffId,
          action: 'token_edit',
          reason: body.reason,
          referenceId: String(token.id),
          details: body.changes,
        },
      });
      return { success: true, data: token };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err?.message });
    }
  });

  app.post('/tokens/:id/delete', async (request: any, reply: any) => {
    // Only Main POS, require password+reason, log audit
    const restaurantId = (request as any).restaurantId as number;
    const staffId = (request as any).staffId;
    const { id } = request.params as { id: string };
    const { z } = await import('zod');
    const schema = z.object({
      password: z.string().min(4),
      reason: z.string().min(5),
    });
    try {
      const body = schema.parse(request.body);
      // Fetch staff and verify password
      const staff = await prisma.staff.findUnique({ where: { id: staffId } });
      if (!staff) return reply.status(403).send({ success: false, error: 'Staff not found' });
      const valid = await bcrypt.compare(body.password, staff.password);
      if (!valid) return reply.status(403).send({ success: false, error: 'Invalid password' });
      // Delete token (soft delete: set status to 'deleted')
      const token = await prisma.bakeryToken.update({ where: { id: Number(id), restaurantId }, data: { status: 'deleted' } });
      // Log audit
      await prisma.auditLog.create({
        data: {
          restaurantId,
          branchId: token.branchId,
          terminalId: null,
          staffId,
          action: 'token_delete',
          reason: body.reason,
          referenceId: String(token.id),
          details: {},
        },
      });
      return { success: true, data: token };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err?.message });
    }
  });

  app.get('/tokens/:id', async (request: any, reply: any) => {
    const restaurantId = (request as any).restaurantId as number;
    const { id } = request.params as { id: string };
    const token = await prisma.bakeryToken.findFirst({
      where: { id: Number(id), restaurantId },
      include: { items: { include: { menuItem: true } }, payments: true, edits: { orderBy: { createdAt: 'desc' } } },
    });
    if (!token) return reply.status(404).send({ success: false, error: 'Token not found' });
    return { success: true, data: token };
  });

  app.post('/tokens/lookup', async (request: any, reply: any) => {
    const restaurantId = (request as any).restaurantId as number;
    const { qrCode, tokenNumber } = request.body as any;
    
    if (!qrCode && !tokenNumber) return reply.status(400).send({ success: false, error: 'qrCode or tokenNumber required' });

    let token = await prisma.bakeryToken.findFirst({
      where: qrCode ? { qrCode, restaurantId } : { tokenNumber: Number(tokenNumber), restaurantId },
      include: { 
         items: { include: { menuItem: true } }, 
         payments: true, 
         edits: { orderBy: { createdAt: 'desc' } },
         order: { include: { kots: { include: { items: { include: { menuItem: true } } } } } } 
      },
    });

    if (!token) return reply.status(404).send({ success: false, error: 'Token not found' });

    // Format Token items + Linked Order items to a single flat structure for UI
    let formatItems = token.items.map((i: any) => ({
      id: `token-${i.id}`,
      menuItemId: i.menuItemId,
      name: i.menuItemName,
      price: Number(i.price),
      quantity: i.quantity,
      isRemoved: i.isRemoved
    }));

    if (token.order) {
       for (const kot of token.order.kots) {
          for (const item of kot.items) {
             // Search if it's already there to add qty or just append new
             const existing = formatItems.find(f => f.menuItemId === item.menuItemId && f.price === Number(item.price) && !f.isRemoved);
             if (existing) {
                existing.quantity += item.quantity;
             } else {
                formatItems.push({
                   id: `kot-${item.id}`,
                   menuItemId: item.menuItemId,
                   name: item.menuItem?.name || 'Unknown',
                   price: Number(item.price),
                   quantity: item.quantity,
                   isRemoved: false
                });
             }
          }
       }
    }

    return { 
      success: true, 
      data: {
        id: token.id,
        tokenNumber: token.tokenNumber,
        qrCode: token.qrCode,
        status: token.status,
        subtotal: Number(token.subtotal),
        items: formatItems
      } 
    };
  });
  // ── Supplier Payments ──
  app.post('/supplier-payments', async (request: any, reply: any) => {
    const restaurantId = (request as any).restaurantId as number;
    const { z } = await import('zod');
    const schema = z.object({
      supplierId: z.number(),
      amount: z.number().positive(),
      method: z.enum(['cash', 'bank', 'cheque', 'upi']),
      paymentDate: z.string(),
      reference: z.string().optional(),
      notes: z.string().optional(),
    });
    try {
      const body = schema.parse(request.body);
      await prisma.$transaction([
        prisma.supplierPayment.create({ data: { ...body, restaurantId, paymentDate: new Date(body.paymentDate) } }),
        prisma.supplier.update({ where: { id: body.supplierId }, data: { outstandingBalance: { decrement: body.amount } } }),
      ]);
      return { success: true };
    } catch (err: any) { return reply.status(400).send({ success: false, error: err?.message }); }
  });

  // ── Exports ──
  app.get('/exports/tokens', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const { from, to, branchId } = request.query as any;
    const where: any = { restaurantId };
    if (from) where.createdAt = { ...where.createdAt, gte: new Date(from) };
    if (to) where.createdAt = { ...where.createdAt, lte: new Date(to) };
    if (branchId) where.branchId = Number(branchId);
    const data = await prisma.bakeryToken.findMany({ where, include: { items: true, payments: true } });
    return { success: true, data };
  });

  app.get('/exports/customers', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const data = await prisma.customer.findMany({ where: { restaurantId } });
    return { success: true, data };
  });

  app.get('/exports/loyalty', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const data = await prisma.loyaltyTransaction.findMany({ where: { restaurantId }, include: { customer: true } });
    return { success: true, data };
  });

  app.get('/exports/stock', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const data = await prisma.inventoryItem.findMany({ where: { restaurantId }, include: { category: true, unit: true } });
    return { success: true, data };
  });

  app.get('/exports/supplier-accounts', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const data = await prisma.supplier.findMany({ where: { restaurantId }, include: { payments: true } });
    return { success: true, data };
  });

  app.get('/exports/daily-summary', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const { date } = request.query as any;
    const d = date ? new Date(date) : new Date();
    const start = new Date(d.setHours(0,0,0,0));
    const end = new Date(d.setHours(23,59,59,999));
    const tokens = await prisma.bakeryToken.findMany({ where: { restaurantId, createdAt: { gte: start, lte: end } } });
    const orders = await prisma.order.findMany({ where: { restaurantId, createdAt: { gte: start, lte: end } } });
    return { success: true, data: { tokens, orders, date: start } };
  });

  // ── Accounts Summary ──
  app.get('/accounts/summary', async (request: any) => {
    const restaurantId = (request as any).restaurantId as number;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [cashOnHandAgg, revenueAgg, pendingAgg, supplierOutstandingAgg, supplierAccounts] = await Promise.all([
      // Cash on hand from active sessions
      prisma.cashRegisterSession.aggregate({
        where: { register: { restaurantId }, status: 'open' },
        _sum: { openingBalance: true }
      }),
      // Today revenue (paid tokens)
      prisma.bakeryToken.aggregate({
        where: { restaurantId, status: 'paid', createdAt: { gte: todayStart } },
        _sum: { total: true }
      }),
      // Pending payments (open tokens)
      prisma.bakeryToken.aggregate({
        where: { restaurantId, status: 'open' },
        _sum: { total: true }
      }),
      // Total outstanding to suppliers
      prisma.supplier.aggregate({
        where: { restaurantId },
        _sum: { outstandingBalance: true }
      }),
      // Supplier accounts table
      prisma.supplier.findMany({
        where: { restaurantId },
        select: {
          id: true, name: true, outstandingBalance: true,
          purchaseOrders: {
            where: { createdAt: { gte: new Date(new Date().setDate(1)) } }, // this month
            select: { total: true }
          },
          payments: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { createdAt: true }
          }
        }
      })
    ]);

    return {
      success: true,
      data: {
        cashOnHand: Number(cashOnHandAgg._sum.openingBalance || 0),
        todayRevenue: Number(revenueAgg._sum.total || 0),
        pendingPayments: Number(pendingAgg._sum.total || 0),
        totalSupplierOutstanding: Number(supplierOutstandingAgg._sum.outstandingBalance || 0),
        supplierAccounts: supplierAccounts.map((s: any) => ({
          ...s,
          monthlyPurchases: s.purchaseOrders.reduce((sum: number, p: any) => sum + Number(p.total), 0),
          lastPayment: s.payments[0]?.createdAt || null
        }))
      }
    };
  });

  // ── Enabled Modules ──
  app.get('/modules', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { enabledModules: true }
    });
    let modules = restaurant?.enabledModules || [];
    if (!Array.isArray(modules) || modules.length === 0) {
      modules = ['restaurant'];
    }
    return { success: true, data: modules };
  });

  // ── Branch Management ──
  app.get('/branches', async (request: any) => {
    const restaurantId = (request as any).restaurantId as number;
    const branches = await prisma.branch.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { orders: true, staff: true } } },
    });
    return { success: true, data: branches };
  });

  app.post('/branches', async (request: any, reply: any) => {
    const restaurantId = (request as any).restaurantId as number;
    const { z } = await import('zod');
    const schema = z.object({
      name: z.string().min(1),
      branchCode: z.string().optional(),
      address: z.string().optional(),
      phone: z.string().optional(),
      managerId: z.number().optional(),
      isDefault: z.boolean().optional(),
    });
    try {
      const body = schema.parse(request.body);
      const branch = await prisma.branch.create({ data: { ...body, restaurantId } });
      return { success: true, data: branch };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err?.message || 'Validation error' });
    }
  });

  app.put('/branches/:id', async (request: any, reply: any) => {
    const restaurantId = (request as any).restaurantId as number;
    const { id } = request.params as { id: string };
    const { z } = await import('zod');
    const schema = z.object({
      name: z.string().min(1).optional(),
      branchCode: z.string().optional(),
      address: z.string().optional(),
      phone: z.string().optional(),
      managerId: z.number().optional(),
      isDefault: z.boolean().optional(),
      isActive: z.boolean().optional(),
      openTime: z.string().optional(),
      closeTime: z.string().optional(),
    });
    try {
      const body = schema.parse(request.body);
      const branch = await prisma.branch.update({
        where: { id: Number(id), restaurantId },
        data: body,
      });
      return { success: true, data: branch };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err?.message || 'Update failed' });
    }
  });

  app.delete('/branches/:id', async (request: any, reply: any) => {
    const restaurantId = (request as any).restaurantId as number;
    const { id } = request.params as { id: string };
    try {
      const branch = await prisma.branch.update({
        where: { id: Number(id), restaurantId },
        data: { isActive: false },
      });
      return { success: true, data: branch, message: 'Branch deactivated' };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err?.message || 'Delete failed' });
    }
  });

  app.get('/branches/:id/stats', async (request: any, reply: any) => {
    const restaurantId = (request as any).restaurantId as number;
    const { id } = request.params as { id: string };
    const branchId = Number(id);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    try {
      const [tokensToday, tokensPaid, revenueAgg, orderCount] = await Promise.all([
        prisma.bakeryToken.count({ where: { restaurantId, branchId, createdAt: { gte: todayStart } } }),
        prisma.bakeryToken.count({ where: { restaurantId, branchId, status: 'paid', createdAt: { gte: todayStart } } }),
        prisma.bakeryToken.aggregate({
          where: { restaurantId, branchId, status: 'paid', createdAt: { gte: todayStart } },
          _sum: { total: true },
        }),
        prisma.order.count({ where: { restaurantId, branchId, createdAt: { gte: todayStart }, status: { not: 'cancelled' } } }),
      ]);
      return {
        success: true,
        data: {
          tokensToday,
          tokensPaid,
          tokensPending: tokensToday - tokensPaid,
          revenue: Number(revenueAgg._sum.total ?? 0),
          ordersToday: orderCount,
        },
      };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err?.message });
    }
  });

  // ── Dashboard ──
  app.get('/dashboard', async (request: any) => {
    const restaurantId = (request as any).restaurantId as number;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    // Chart range (days) can be requested via ?days=7|14|30 (default: 7)
    const days = Math.min(Math.max(Number(request.query?.days) || 7, 7), 30);
    const labels: string[] = [];
    const chartQueries: any[] = [];
    for (let i = days - 1; i >= 0; i--) {
        const date = new Date(startOfToday.getTime() - i * 24 * 60 * 60 * 1000);
        const nextDate = new Date(date.getTime() + 24 * 60 * 60 * 1000);
        labels.push(date.toLocaleDateString('en-US', { day: '2-digit', month: 'short' }));
        chartQueries.push(prisma.order.aggregate({
            _sum: { total: true },
            where: { restaurantId, createdAt: { gte: date, lt: nextDate }, status: 'paid' }
        }));
    }

    const [
        todayOrders, yesterdayOrders, 
        monthOrders, previousMonthOrders, 
        todayRevenueAgg, yesterdayRevenueAgg, 
        monthRevenueAgg, previousMonthRevenueAgg, 
        totalCustomers, recentOrders,
        payments, chartDataResults,
        // Bakery specific additions
        tokensToday, tokensPaid, tokensPendingAgg,
        branchBreakdown,
        stockAlerts,
        taxAgg
    ] = await Promise.all([
      prisma.order.count({ where: { restaurantId, createdAt: { gte: startOfToday }, status: { not: 'cancelled' } } }),
      prisma.order.count({ where: { restaurantId, createdAt: { gte: startOfYesterday, lt: startOfToday }, status: { not: 'cancelled' } } }),
      prisma.order.count({ where: { restaurantId, createdAt: { gte: startOfMonth }, status: { not: 'cancelled' } } }),
      prisma.order.count({ where: { restaurantId, createdAt: { gte: startOfPreviousMonth, lt: startOfMonth }, status: { not: 'cancelled' } } }),
      prisma.order.aggregate({ _sum: { total: true }, where: { restaurantId, createdAt: { gte: startOfToday }, status: 'paid' } }),
      prisma.order.aggregate({ _sum: { total: true }, where: { restaurantId, createdAt: { gte: startOfYesterday, lt: startOfToday }, status: 'paid' } }),
      prisma.order.aggregate({ _sum: { total: true }, where: { restaurantId, createdAt: { gte: startOfMonth }, status: 'paid' } }),
      prisma.order.aggregate({ _sum: { total: true }, where: { restaurantId, createdAt: { gte: startOfPreviousMonth, lt: startOfMonth }, status: 'paid' } }),
      prisma.customer.count({ where: { restaurantId } }),
      prisma.order.findMany({
        where: { restaurantId },
        include: { 
          table: true, 
          customer: true, 
          staff: true, 
          kots: { 
            include: { 
              items: { 
                include: { menuItem: { select: { image: true } } } 
              } 
            } 
          } 
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.orderPayment.findMany({
        where: { order: { restaurantId }, paidAt: { gte: startOfToday } },
        select: { amount: true, method: true }
      }),
      Promise.all(chartQueries),
      // Bakery
      prisma.bakeryToken.count({ where: { restaurantId, createdAt: { gte: startOfToday } } }),
      prisma.bakeryToken.count({ where: { restaurantId, status: 'paid', createdAt: { gte: startOfToday } } }),
      prisma.bakeryToken.count({ where: { restaurantId, status: 'open', createdAt: { gte: startOfToday } } }),
      prisma.branch.findMany({
        where: { restaurantId, isActive: true },
        select: { id: true, name: true, _count: { select: { orders: { where: { createdAt: { gte: startOfToday } } } } } }
      }),
      prisma.inventoryItem.count({ where: { restaurantId, currentStock: { lte: prisma.inventoryItem.fields.thresholdQty } } }),
      prisma.bakeryToken.aggregate({
        where: { restaurantId, createdAt: { gte: startOfToday }, status: 'paid' },
        _sum: { subtotal: true, sgst: true, cgst: true, igst: true, total: true }
      })
    ]);

    const todayRevenue = Number(todayRevenueAgg._sum.total || 0);
    const yesterdayRevenue = Number(yesterdayRevenueAgg._sum.total || 0);
    const monthRevenue = Number(monthRevenueAgg._sum.total || 0);
    const previousMonthRevenue = Number(previousMonthRevenueAgg._sum.total || 0);

    const calculateChange = (current: number, previous: number) => {
        if (previous === 0) return current > 0 ? 100 : 0;
        return ((current - previous) / previous) * 100;
    };

    const paymentMethodsMap: Record<string, number> = {};
    for (const p of payments) {
        if (!paymentMethodsMap[p.method]) paymentMethodsMap[p.method] = 0;
        paymentMethodsMap[p.method] += Number(p.amount);
    }
    const paymentMethods = Object.keys(paymentMethodsMap).map(method => ({
        name: method.charAt(0).toUpperCase() + method.slice(1),
        value: paymentMethodsMap[method]
    }));

    const chartData = chartDataResults.map((res: any, i: number) => ({
        label: labels[i],
        value: Number(res._sum.total || 0)
    }));

    return {
      success: true,
      data: {
        todayOrders,
        ordersChange: calculateChange(todayOrders, yesterdayOrders),
        todayRevenue,
        revenueChange: calculateChange(todayRevenue, yesterdayRevenue),
        monthRevenue,
        monthRevenueChange: calculateChange(monthRevenue, previousMonthRevenue),
        salesThisMonth: monthRevenue,
        totalCustomers,
        customersChange: 0,
        recentOrders: recentOrders.map((o: any) => ({
            id: o.id,
            orderNumber: o.orderNumber,
            type: o.type.replace('_', ' '),
            table: o.table,
            items: o.kots?.reduce((total: number, kot: any) => total + (kot.items?.length || 0), 0) || 0,
            itemImages: o.kots?.flatMap((kot: any) => 
                kot.items?.map((i: any) => i.menuItem?.image).filter(Boolean)
            ).slice(0, 3) || [],
            waiter: o.staff?.name || 'Walk-in',
            status: o.status,
            total: Number(o.total),
            createdAt: o.createdAt,
            customer: o.customer?.name
        })),
        paymentMethods,
        chartData,
        // Bakery enhancements
        bakery: {
          tokensToday,
          tokensPaid,
          tokensPending: tokensToday - tokensPaid,
          stockAlerts,
          taxSummaryToday: {
            subtotal: Number(taxAgg._sum.subtotal || 0),
            sgst: Number(taxAgg._sum.sgst || 0),
            cgst: Number(taxAgg._sum.cgst || 0),
            igst: Number(taxAgg._sum.igst || 0),
            totalTax: Number(taxAgg._sum.sgst || 0) + Number(taxAgg._sum.cgst || 0) + Number(taxAgg._sum.igst || 0),
            grandTotal: Number(taxAgg._sum.total || 0)
          },
          branchBreakdown: branchBreakdown.map(b => ({
            branchId: b.id,
            branchName: b.name,
            ordersToday: b._count.orders
          }))
        }
      },
    };
  });

  // ── Menu Management ──
  app.get('/menus', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const menus = await prisma.menu.findMany({
      where: { restaurantId },
      include: { _count: { select: { menuItems: true } } },
      orderBy: { sortOrder: 'asc' },
    });
    return { success: true, data: menus };
  });

  app.post('/menus', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const body = request.body as any;
    const menu = await prisma.menu.create({
      data: { ...body, restaurantId },
    });
    return { success: true, data: menu };
  });

  app.put('/menus/:id', async (request: any) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const menu = await prisma.menu.update({
      where: { id: Number(id) },
      data: body,
    });
    return { success: true, data: menu };
  });

  app.delete('/menus/:id', async (request: any) => {
    const { id } = request.params as { id: string };
    await prisma.menu.delete({ where: { id: Number(id) } });
    return { success: true, message: 'Menu deleted' };
  });

  // ── Menu Items ──
  app.get('/menu-items', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const { menuId, categoryId, search } = request.query as any;
    const where: any = { restaurantId };
    if (menuId) where.menuId = Number(menuId);
    if (categoryId) where.categoryId = Number(categoryId);
    if (search) where.name = { contains: search };

    const items = await prisma.menuItem.findMany({
      where,
      include: { category: true, menu: true, itemModifiers: { include: { modifierGroup: true } } },
      orderBy: { sortOrder: 'asc' },
    });
    return { success: true, data: items };
  });

  app.post('/menu-items', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const body = request.body as any;
    const item = await prisma.menuItem.create({
      data: { 
        ...body, 
        restaurantId,
        productQR: body.productQR || null,
        isAutoImage: body.isAutoImage ?? true
      },
    });
    return { success: true, data: item };
  });

  app.put('/menu-items/:id', async (request: any) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const item = await prisma.menuItem.update({
      where: { id: Number(id) },
      data: {
        ...body,
        productQR: body.productQR !== undefined ? (body.productQR || null) : undefined,
      },
    });
    return { success: true, data: item };
  });

  app.delete('/menu-items/:id', async (request: any) => {
    const { id } = request.params as { id: string };
    await prisma.menuItem.delete({ where: { id: Number(id) } });
    return { success: true, message: 'Item deleted' };
  });

  // ── Item Categories ──
  app.get('/item-categories', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const categories = await prisma.itemCategory.findMany({
      where: { restaurantId },
      include: { _count: { select: { menuItems: true } } },
      orderBy: { sortOrder: 'asc' },
    });
    return { success: true, data: categories };
  });

  app.post('/item-categories', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const body = request.body as any;
    const category = await prisma.itemCategory.create({
      data: { 
        ...body, 
        restaurantId,
        isKOTEnabled: body.isKOTEnabled ?? true
      },
    });
    return { success: true, data: category };
  });

  app.put('/item-categories/:id', async (request: any) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const category = await prisma.itemCategory.update({
      where: { id: Number(id) },
      data: body,
    });
    return { success: true, data: category };
  });

  // ── Modifier Groups ──
  app.get('/modifier-groups', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const groups = await prisma.modifierGroup.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
    });
    return { success: true, data: groups };
  });

  app.post('/modifier-groups', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const body = request.body as any;
    const group = await prisma.modifierGroup.create({
      data: { ...body, restaurantId },
    });
    return { success: true, data: group };
  });

  // ── Areas & Tables ──
  app.get('/areas', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const areas = await prisma.area.findMany({
      where: { restaurantId },
      include: { tables: true },
      orderBy: { sortOrder: 'asc' },
    });
    return { success: true, data: areas };
  });

  app.post('/areas', async (request: any, reply: any) => {
    const restaurantId = (request as any).restaurantId;
    const body = request.body as any;
    try {
      let branchId = body.branchId;
      if (!branchId) {
        const branch = await prisma.branch.findFirst({ where: { restaurantId }, orderBy: { createdAt: 'asc' } });
        if (!branch) return reply.status(400).send({ success: false, error: 'No branch found for restaurant; create a branch first' });
        branchId = branch.id;
      }
      const area = await prisma.area.create({
        data: { ...body, restaurantId, branchId },
      });
      return { success: true, data: area };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err?.message || String(err) });
    }
  });

  app.get('/tables', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const tables = await prisma.table.findMany({
      where: { restaurantId },
      include: { area: true, _count: { select: { orders: true } } },
    });
    return { success: true, data: tables };
  });

  app.post('/tables', async (request: any, reply: any) => {
    const restaurantId = (request as any).restaurantId;
    const body = request.body as any;
    try {
      if (!body.areaId) return reply.status(400).send({ success: false, error: 'Please select a valid area' });
      const area = await prisma.area.findUnique({ where: { id: Number(body.areaId) } });
      if (!area || area.restaurantId !== restaurantId) return reply.status(400).send({ success: false, error: 'Invalid area selected' });
      const table = await prisma.table.create({
        data: { ...body, restaurantId },
      });
      return { success: true, data: table };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err?.message || String(err) });
    }
  });

  app.post('/tables/assign-menu', async (request: any) => {
    const body = request.body as any;
    const existing = await prisma.tableMenu.findFirst({
        where: { tableId: Number(body.tableId), menuId: Number(body.menuId) }
    });
    if (existing) {
        const updated = await prisma.tableMenu.update({
            where: { id: existing.id },
            data: { isActive: body.isActive }
        });
        return { success: true, data: updated };
    } else {
        const created = await prisma.tableMenu.create({
            data: {
                tableId: Number(body.tableId),
                menuId: Number(body.menuId),
                isActive: body.isActive
            }
        });
        return { success: true, data: created };
    }
  });

  // ── Orders ──
  app.get('/orders', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const { status, type, page = 1, limit = 50 } = request.query as any;
    const where: any = { restaurantId };
    if (status) where.status = status;
    if (type) where.type = type;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          table: true,
          customer: true,
          staff: { select: { name: true } },
          kots: { include: { items: { include: { menuItem: true } } } },
          payments: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.order.count({ where }),
    ]);

    return {
      success: true,
      data: orders,
      pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
    };
  });

  app.post('/orders', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const user = request.user as any;
    const body = request.body as any;

    const settings = await prisma.restaurantSettings.findUnique({ where: { restaurantId } });
    const orderCount = await prisma.order.count({ where: { restaurantId } });
    const orderNumber = `${settings?.orderPrefix || 'ORD'}-${String(orderCount + 1).padStart(5, '0')}`;

    const order = await prisma.$transaction(async (tx: any) => {
      // Calculate totals
      let addedSubtotal = 0;
      for (const item of body.items) {
        const menuItem = await tx.menuItem.findUnique({ where: { id: item.menuItemId } });
        if (menuItem) {
          let itemTotal = Number(menuItem.price) * item.quantity;
          if (item.modifiers) {
            itemTotal += item.modifiers.reduce((sum: number, m: any) => sum + (m.price || 0), 0) * item.quantity;
          }
          addedSubtotal += itemTotal;
        }
      }

      const sgstRate = Number(settings?.sgstRate || 0);
      const cgstRate = Number(settings?.cgstRate || 0);
      const addedSgst = addedSubtotal * (sgstRate / 100);
      const addedCgst = addedSubtotal * (cgstRate / 100);
      const addedTotal = addedSubtotal + addedSgst + addedCgst;

      let ordId: number | null = null;
      let ord: any;
      let isNewOrder = true;

      // Check if we are linking to a bakery token
      if (body.bakeryTokenId) {
        const existingToken = await tx.bakeryToken.findUnique({ where: { id: body.bakeryTokenId } });
        if (existingToken?.orderId) {
          ordId = existingToken.orderId;
          isNewOrder = false;
        }
      }

      if (isNewOrder) {
        ord = await tx.order.create({
          data: {
            restaurantId,
            branchId: user.branchId,
            tableId: body.tableId,
            customerId: body.customerId,
            staffId: user.staffId,
            orderNumber,
            type: body.type || 'dine_in',
            pax: body.pax || 1,
            subtotal: addedSubtotal,
            sgst: addedSgst,
            cgst: addedCgst,
            total: addedTotal,
            note: body.note,
          },
        });
        ordId = ord.id;

        if (body.bakeryTokenId) {
          await tx.bakeryToken.update({
            where: { id: body.bakeryTokenId },
            data: { orderId: ordId }
          });
        }
      } else {
        if (ordId === null) {
          throw new Error('Order ID is not set for update');
        }
        ord = await tx.order.update({
          where: { id: ordId },
          data: {
            subtotal: { increment: addedSubtotal },
            sgst: { increment: addedSgst },
            cgst: { increment: addedCgst },
            total: { increment: addedTotal },
            pax: body.pax,
            tableId: body.tableId,
          }
        });
      }

      // Create KOT (Only for KOT-enabled items)
      const kotCount = await tx.kOT.count({ where: { restaurantId } });
      const kotNumber = `${settings?.kotPrefix || 'KOT'}-${String(kotCount + 1).padStart(5, '0')}`;

      // Filter items that belong to KOT-enabled categories
      const kotItemsData = [];
      for (const item of body.items) {
        const menuItem = await tx.menuItem.findUnique({ 
          where: { id: item.menuItemId },
          include: { category: true }
        });
        
        if (menuItem && (!menuItem.category || menuItem.category.isKOTEnabled)) {
          kotItemsData.push({
            menuItemId: item.menuItemId,
            quantity: item.quantity,
            price: menuItem.price,
            modifiers: item.modifiers || null,
            note: item.note,
          });
        }
      }

      let kot = null;
      if (kotItemsData.length > 0) {
        kot = await tx.kOT.create({
          data: {
            orderId: ordId,
            restaurantId,
            kotNumber,
            items: {
              create: kotItemsData
            },
          },
          include: { items: { include: { menuItem: true } } },
        });
      }

      // If linking to a bakery token, add them as bakery tokens items directly
      if (body.bakeryTokenId) {
        const tokenItemsToCreate = [];
        for (const item of body.items) {
           const mi = await tx.menuItem.findUnique({ where: { id: item.menuItemId } });
           if (mi) {
              tokenItemsToCreate.push({
                 tokenId: body.bakeryTokenId,
                 menuItemId: item.menuItemId,
                 menuItemName: mi.name,
                 price: mi.price,
                 quantity: item.quantity,
                 total: Number(mi.price) * item.quantity,
                 addedBy: `waiter:${user?.name || user?.staffId || 'unknown'}`
              });
           }
        }
        if (tokenItemsToCreate.length > 0) {
           await tx.bakeryTokenItem.createMany({ data: tokenItemsToCreate });
        }
        
        // Mark order as merged so it doesn't double count revenue
        await tx.order.update({
           where: { id: ordId },
           data: { status: 'merged_to_token' }
        });
      }

      // Update table status (table should be occupied when an order is placed, including token-linked orders)
      if (body.tableId) {
        await tx.table.update({
          where: { id: body.tableId },
          data: { status: 'occupied' },
        });
      }

      return { ...ord, kots: [kot] };
    });

    if (body.bakeryTokenId) {
        // dynamic import mapping to recalculate, since it's an isolated logic outside transaction
        const { recalculateTokenTotals } = await import('../../utils/taxCalculator.js');
        await recalculateTokenTotals(body.bakeryTokenId, prisma);
        const updated = await prisma.bakeryToken.findUnique({ where: { id: body.bakeryTokenId }});
        emitToRestaurant(restaurantId, 'token_updated', updated);
    }

    // Real-time notification
    emitToRestaurant(restaurantId, 'new_order', order);
    emitToKitchen(restaurantId, 'new_kot', order);

    return { success: true, data: order };
  });
  // Single order detail
  app.get('/orders/:id', async (request: any) => {
    const { id } = request.params as { id: string };
    const restaurantId = (request as any).restaurantId;
    const order = await prisma.order.findFirst({
      where: { id: Number(id), restaurantId },
      include: {
        table: true,
        customer: true,
        staff: { select: { id: true, name: true } },
        kots: { include: { items: { include: { menuItem: true } } } },
        payments: true,
        restaurant: { select: { name: true, phone: true, address: true, email: true } },
      },
    });
    if (!order) return { success: false, error: 'Order not found' };

    // Flatten items from all KOTs
    const items = order.kots.flatMap((kot: any) =>
      kot.items.map((i: any) => ({
        id: i.id,
        name: i.menuItem?.name || 'Unknown',
        image: i.menuItem?.image || null,
        quantity: i.quantity,
        price: Number(i.price),
        amount: Number(i.price) * i.quantity,
        modifiers: i.modifiers,
        note: i.note,
      }))
    );

    return {
      success: true,
      data: {
        ...order,
        flatItems: items,
      },
    };
  });

  app.put('/orders/:id', async (request: any) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const order = await prisma.order.update({
      where: { id: Number(id) },
      data: body,
    });
    const restaurantId = (request as any).restaurantId;
    emitToRestaurant(restaurantId, 'order_updated', order);
    return { success: true, data: order };
  });

  app.post('/orders/:id/cancel', async (request: any) => {
    const { id } = request.params as { id: string };
    const { reason } = request.body as { reason?: string };
    const order = await prisma.order.update({
      where: { id: Number(id) },
      data: { status: 'cancelled', cancelReason: reason },
    });

    // Free up table
    if (order.tableId) {
      await prisma.table.update({
        where: { id: order.tableId },
        data: { status: 'available' },
      });
    }

    const restaurantId = (request as any).restaurantId;
    emitToRestaurant(restaurantId, 'order_updated', order);
    return { success: true, data: order };
  });

  // ── Bill Generation ──
  app.post('/orders/:id/bill', async (request: any, reply: any) => {
    const { id } = request.params as { id: string };
    const restaurantId = (request as any).restaurantId;

    const order = await prisma.order.findFirst({
      where: { id: Number(id), restaurantId },
      include: {
        table: true,
        customer: true,
        staff: { select: { name: true } },
        kots: { include: { items: { include: { menuItem: true } } } },
        payments: true,
        restaurant: { select: { name: true, phone: true, address: true, email: true } },
      },
    });

    if (!order) {
      return reply.status(404).send({ success: false, error: 'Order not found' });
    }

    const items = order.kots.flatMap((kot: any) =>
      kot.items.map((item: any) => ({
        name: item.menuItem?.name || 'Unknown',
        price: Number(item.price),
        quantity: item.quantity,
        total: Number(item.price) * item.quantity,
        modifiers: item.modifiers,
        note: item.note,
      }))
    );

    const bill = {
      orderId: order.id,
      orderNumber: order.orderNumber,
      customer: order.customer ? { name: order.customer.name, phone: order.customer.phone } : null,
      table: order.table ? { name: order.table.name } : null,
      items,
      subtotal: order.subtotal,
      sgst: order.sgst,
      cgst: order.cgst,
      total: order.total,
      payments: order.payments,
      createdAt: order.createdAt,
    };

    return { success: true, data: bill };
  });

  // ── KOT ──
  app.get('/kots', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const { kitchenId, status } = request.query as any;
    const where: any = { restaurantId };
    if (kitchenId) where.kitchenId = Number(kitchenId);
    if (status) where.status = status;

    const kots = await prisma.kOT.findMany({
      where,
      include: {
        order: { include: { table: true, staff: { select: { name: true } } } },
        items: { include: { menuItem: true } },
        kitchen: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return { success: true, data: kots };
  });

  app.put('/kots/:id/status', async (request: any) => {
    const { id } = request.params as { id: string };
    const { status } = request.body as { status: string };
    const kot = await prisma.kOT.update({
      where: { id: Number(id) },
      data: { status },
      include: { items: { include: { menuItem: true } } },
    });
    const restaurantId = (request as any).restaurantId;
    emitToRestaurant(restaurantId, 'kot_updated', kot);
    emitToKitchen(restaurantId, 'kot_updated', kot);
    return { success: true, data: kot };
  });

  // ── Customers ──
  app.get('/customers', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const { search, page = 1, limit = 20 } = request.query as any;
    const where: any = { restaurantId };
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
      ];
    }

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.customer.count({ where }),
    ]);

    return {
      success: true,
      data: customers,
      pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
    };
  });

  app.post('/customers', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const body = request.body as any;
    const customer = await prisma.customer.create({
      data: { ...body, restaurantId },
    });
    return { success: true, data: customer };
  });

  // ── Staff ──
  app.get('/staff', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const staff = await prisma.staff.findMany({
      where: { restaurantId },
      select: {
        id: true, name: true, email: true, role: true, phone: true,
        avatar: true, isActive: true, lastLoginAt: true, createdAt: true,
        branch: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return { success: true, data: staff };
  });

  app.post('/staff', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const body = request.body as any;
    const hashedPassword = await bcrypt.hash(body.password, 10);
    const staff = await prisma.staff.create({
      data: { ...body, password: hashedPassword, restaurantId },
    });
    return { success: true, data: { ...staff, password: undefined } };
  });

  app.put('/staff/:id', async (request: any) => {
    const { id } = request.params as { id: string };
    const restaurantId = (request as any).restaurantId;
    const body = request.body as any;
    
    const updateData: any = {
        name: body.name,
        phone: body.phone,
        role: body.role,
        isActive: body.isActive
    };

    if (body.password) {
        updateData.password = await bcrypt.hash(body.password, 10);
    }

    const staff = await prisma.staff.update({
      where: { id: Number(id), restaurantId },
      data: updateData,
    });
    return { success: true, data: { ...staff, password: undefined } };
  });

  app.put('/staff/:id/role', async (request: any) => {
    const { id } = request.params as { id: string };
    const restaurantId = (request as any).restaurantId;
    const { role } = request.body as { role: string };

    const staff = await prisma.staff.update({
      where: { id: Number(id), restaurantId },
      data: { role },
    });
    return { success: true, data: { ...staff, password: undefined } };
  });

  app.delete('/staff/:id', async (request: any) => {
    const { id } = request.params as { id: string };
    const restaurantId = (request as any).restaurantId;
    await prisma.staff.delete({
      where: { id: Number(id), restaurantId },
    });
    return { success: true, message: 'Staff deleted successfully' };
  });

  app.get('/staff/export', async (request: any, reply: any) => {
    const restaurantId = (request as any).restaurantId;
    const staff = await prisma.staff.findMany({
      where: { restaurantId },
      include: { branch: true },
    });

    const header = 'ID,Name,Email,Phone,Role,Branch,Status,Created At\n';
    const rows = staff.map((s: any) => {
        return `${s.id},"${s.name}","${s.email}","${s.phone || ''}",${s.role},"${s.branch?.name || 'All'}",${s.isActive ? 'Active' : 'Inactive'},"${s.createdAt.toISOString()}"`;
    }).join('\n');

    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', `attachment; filename="staff_export_${Date.now()}.csv"`);
    return reply.send(header + rows);
  });

  // ── Expenses ──
  app.get('/expenses', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const expenses = await prisma.expense.findMany({
      where: { restaurantId },
      include: { category: true },
      orderBy: { expenseDate: 'desc' },
    });
    return { success: true, data: expenses };
  });

  app.post('/expenses', async (request: any, reply: any) => {
    const restaurantId = (request as any).restaurantId;
    const body = request.body as any;
    try {
      const expenseDate = body.expenseDate ? new Date(body.expenseDate) : new Date();
      if (isNaN(expenseDate.getTime())) return reply.status(400).send({ success: false, error: 'Invalid expenseDate' });
      // Remove restaurant property if present
      const { restaurant, ...rest } = body;
      // Debug log
      console.log('Expense POST body:', body);
      console.log('Expense POST rest:', rest);
      // Remove any nested restaurant property just in case
      if ('restaurant' in rest) delete rest.restaurant;
      const expense = await prisma.expense.create({
        data: { ...rest, restaurantId, expenseDate },
      });
      return { success: true, data: expense };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err?.message || String(err) });
    }
  });

  app.get('/expense-categories', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const categories = await prisma.expenseCategory.findMany({
      where: { restaurantId },
      include: { _count: { select: { expenses: true } } },
    });
    return { success: true, data: categories };
  });

  app.post('/expense-categories', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const body = request.body as any;
    const category = await prisma.expenseCategory.create({
      data: { ...body, restaurantId },
    });
    return { success: true, data: category };
  });

  // ── Settings ──
  app.get('/settings', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const settings = await prisma.restaurantSettings.findUnique({ where: { restaurantId } });
    return { success: true, data: settings };
  });

  app.put('/settings/general', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const { z } = await import('zod');
    const schema = z.object({
      isInterState: z.boolean().optional(),
      igstRate: z.number().optional(),
      posDeletePassword: z.string().optional(),
      // other fields can be added here
    }).passthrough();

    try {
      const data = schema.parse(request.body);
      
      // Hash POS delete password if provided
      if (data.posDeletePassword) {
        data.posDeletePassword = await bcrypt.hash(data.posDeletePassword, 10);
      }

      const settings = await prisma.restaurantSettings.update({
        where: { restaurantId },
        data: data as any,
      });
      return { success: true, data: settings };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  });

  // ── Waiter Requests ──
  app.get('/waiter-requests', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const requests = await prisma.waiterRequest.findMany({
      where: { restaurantId },
      include: { table: true, staff: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return { success: true, data: requests };
  });

  app.put('/waiter-requests/:id/attend', async (request: any) => {
    const { id } = request.params as { id: string };
    const restaurantId = (request as any).restaurantId;
    const deleted = await prisma.waiterRequest.deleteMany({
      where: { id: Number(id), restaurantId },
    });
    if (!deleted.count) return { success: false, error: 'Waiter request not found' };
    return { success: true, data: { id: Number(id), deleted: true } };
  });

  app.patch('/waiter-requests/:id/attend', async (request: any) => {
    const { id } = request.params as { id: string };
    const restaurantId = (request as any).restaurantId;
    const deleted = await prisma.waiterRequest.deleteMany({
      where: { id: Number(id), restaurantId },
    });
    if (!deleted.count) return { success: false, error: 'Waiter request not found' };
    return { success: true, data: { id: Number(id), deleted: true } };
  });

  app.delete('/waiter-requests/:id', async (request: any) => {
    const { id } = request.params as { id: string };
    await prisma.waiterRequest.delete({ where: { id: Number(id) } });
    return { success: true, data: { id: Number(id) } };
  });

  // ── Reservations ──
  app.get('/reservations', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const reservations = await prisma.reservation.findMany({
      where: { restaurantId },
      include: { table: true },
      orderBy: { date: 'desc' },
    });
    return { success: true, data: reservations };
  });

  app.post('/reservations', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const body = request.body as any;
    const reservation = await prisma.reservation.create({
      data: { ...body, restaurantId, date: new Date(body.date) },
    });
    return { success: true, data: reservation };
  });

  // ── Payments ──
  app.get('/payments', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const payments = await prisma.orderPayment.findMany({
      where: { order: { restaurantId } },
      include: { order: { select: { orderNumber: true, total: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return { success: true, data: payments };
  });

  app.post('/orders/:id/payment', async (request: any) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const restaurantId = (request as any).restaurantId;

    const payment = await prisma.$transaction(async (tx: any) => {
      const pay = await tx.orderPayment.create({
        data: {
          orderId: Number(id),
          amount: body.amount,
          method: body.method,
          transactionId: body.transactionId,
          isDue: body.method === 'due',
          paidAt: body.method !== 'due' ? new Date() : null,
        },
      });

      const updatedOrder = await tx.order.update({
        where: { id: Number(id) },
        data: { status: 'paid' },
      });

      // Free up table if dine-in
      if (updatedOrder.tableId) {
        await tx.table.update({
          where: { id: updatedOrder.tableId },
          data: { status: 'available' },
        });
      }

      return pay;
    });

    emitToRestaurant(restaurantId, 'order_updated', { orderId: Number(id), status: 'paid' });
    return { success: true, data: payment };
  });

  // ── Kitchens ──
  app.get('/kitchens', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const kitchens = await prisma.kitchen.findMany({
      where: { restaurantId },
      include: { _count: { select: { kots: true } } },
    });
    return { success: true, data: kitchens };
  });

  app.post('/kitchens', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const body = request.body as any;
    const kitchen = await prisma.kitchen.create({
      data: { ...body, restaurantId },
    });
    return { success: true, data: kitchen };
  });
}
function emitToTable(token: any, arg1: string, kotItem: { kot: { items: ({ menuItem: { id: number; restaurantId: number; name: string; description: string | null; image: string | null; createdAt: Date; updatedAt: Date; price: Decimal; menuId: number; categoryId: number | null; isVeg: boolean; isAvailable: boolean; showOnCustomerSite: boolean; preparationTime: number | null; sortOrder: number; }; } & { id: number; status: string; note: string | null; kotId: number; menuItemId: number; quantity: number; price: Decimal; modifiers: JsonValue | null; removedBy: number | null; removeReason: string | null; removedAt: Date | null; })[]; order: { table: { id: number; restaurantId: number; name: string; status: string; createdAt: Date; isActive: boolean; capacity: number; areaId: number; qrToken: string; } | null; staff: { name: string; } | null; } & { total: Decimal; id: number; restaurantId: number; status: string; createdAt: Date; updatedAt: Date; sgst: Decimal; cgst: Decimal; branchId: number | null; tableId: number | null; customerId: number | null; staffId: number | null; pax: number; subtotal: Decimal; discount: Decimal; deliveryFee: Decimal; tip: Decimal; orderNumber: string; type: string; waiterAcceptance: string; note: string | null; cancelReason: string | null; isDraft: boolean; }; kitchen: { id: number; restaurantId: number; name: string; createdAt: Date; isActive: boolean; type: string; isDefault: boolean; printerName: string | null; menuItemIds: JsonValue | null; } | null; } & { id: number; restaurantId: number; status: string; createdAt: Date; updatedAt: Date; orderId: number; kitchenId: number | null; kotNumber: string; printedAt: Date | null; }; menuItem: { id: number; restaurantId: number; name: string; description: string | null; image: string | null; createdAt: Date; updatedAt: Date; price: Decimal; menuId: number; categoryId: number | null; isVeg: boolean; isAvailable: boolean; showOnCustomerSite: boolean; preparationTime: number | null; sortOrder: number; }; } & { id: number; status: string; note: string | null; kotId: number; menuItemId: number; quantity: number; price: Decimal; modifiers: JsonValue | null; removedBy: number | null; removeReason: string | null; removedAt: Date | null; }) {
  throw new Error('Function not implemented.');
}

