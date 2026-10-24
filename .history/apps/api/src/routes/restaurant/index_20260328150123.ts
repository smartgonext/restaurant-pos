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

export async function restaurantRoutes(app: FastifyInstance) {
  // All routes require auth + tenant scoping
  app.addHook('onRequest', authenticate);
  app.addHook('onRequest', tenantScope);
  
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

  // ── Enabled Modules ──
  app.get('/modules', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { enabledModules: true }
    });
    const modules = restaurant?.enabledModules || [];
    return { success: true, data: modules };
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
        payments, chartDataResults
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
      Promise.all(chartQueries)
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
        chartData
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
      data: { ...body, restaurantId },
    });
    return { success: true, data: item };
  });

  app.put('/menu-items/:id', async (request: any) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const item = await prisma.menuItem.update({
      where: { id: Number(id) },
      data: body,
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
      data: { ...body, restaurantId },
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

  app.post('/areas', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const body = request.body as any;
    const area = await prisma.area.create({
      data: { ...body, restaurantId },
    });
    return { success: true, data: area };
  });

  app.get('/tables', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const tables = await prisma.table.findMany({
      where: { restaurantId },
      include: { area: true, _count: { select: { orders: true } } },
    });
    return { success: true, data: tables };
  });

  app.post('/tables', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const body = request.body as any;
    const table = await prisma.table.create({
      data: { ...body, restaurantId },
    });
    return { success: true, data: table };
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
      let subtotal = 0;
      for (const item of body.items) {
        const menuItem = await tx.menuItem.findUnique({ where: { id: item.menuItemId } });
        if (menuItem) {
          let itemTotal = Number(menuItem.price) * item.quantity;
          if (item.modifiers) {
            itemTotal += item.modifiers.reduce((sum: number, m: any) => sum + (m.price || 0), 0) * item.quantity;
          }
          subtotal += itemTotal;
        }
      }

      const sgstRate = Number(settings?.sgstRate || 0);
      const cgstRate = Number(settings?.cgstRate || 0);
      const sgst = subtotal * (sgstRate / 100);
      const cgst = subtotal * (cgstRate / 100);
      const total = subtotal + sgst + cgst;

      const ord = await tx.order.create({
        data: {
          restaurantId,
          branchId: user.branchId,
          tableId: body.tableId,
          customerId: body.customerId,
          staffId: user.staffId,
          orderNumber,
          type: body.type || 'dine_in',
          pax: body.pax || 1,
          subtotal,
          sgst,
          cgst,
          total,
          note: body.note,
        },
      });

      // Create KOT
      const kotCount = await tx.kOT.count({ where: { restaurantId } });
      const kotNumber = `${settings?.kotPrefix || 'KOT'}-${String(kotCount + 1).padStart(5, '0')}`;

      const kot = await tx.kOT.create({
        data: {
          orderId: ord.id,
          restaurantId,
          kotNumber,
          items: {
            create: await Promise.all(
              body.items.map(async (item: any) => {
                const menuItem = await tx.menuItem.findUnique({ where: { id: item.menuItemId } });
                return {
                  menuItemId: item.menuItemId,
                  quantity: item.quantity,
                  price: menuItem?.price || 0,
                  modifiers: item.modifiers || null,
                  note: item.note,
                };
              })
            ),
          },
        },
        include: { items: { include: { menuItem: true } } },
      });

      // Update table status
      if (body.tableId) {
        await tx.table.update({
          where: { id: body.tableId },
          data: { status: 'running' },
        });
      }

      return { ...ord, kots: [kot] };
    });

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
  app.post('/orders/:id/bill', async (request: any) => {
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
      return app.httpErrors.notFound('Order not found');
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

  app.post('/expenses', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const body = request.body as any;
    const expense = await prisma.expense.create({
      data: { ...body, restaurantId, expenseDate: new Date(body.expenseDate) },
    });
    return { success: true, data: expense };
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
    const body = request.body as any;
    const settings = await prisma.restaurantSettings.update({
      where: { restaurantId },
      data: body,
    });
    return { success: true, data: settings };
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
    const user = request.user as any;
    const waiterRequest = await prisma.waiterRequest.update({
      where: { id: Number(id) },
      data: { status: 'attended', staffId: user.staffId, attendedAt: new Date() },
    });
    return { success: true, data: waiterRequest };
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
