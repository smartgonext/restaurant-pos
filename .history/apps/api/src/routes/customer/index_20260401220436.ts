import { FastifyInstance } from 'fastify';
import { prisma } from '../../app.js';
import { emitToRestaurant } from '../../plugins/socket.js';

export async function customerRoutes(app: FastifyInstance) {
  // Preview route: allow viewing a restaurant's menu without a table QR token
  app.get('/:restaurantSlug/preview/menu', async (request, reply) => {
    const { restaurantSlug } = request.params as any;
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: restaurantSlug },
      select: { id: true, name: true, logo: true, settings: true },
    });
    if (!restaurant) return reply.status(404).send({ success: false, error: 'Restaurant not found' });

    const menus = await prisma.menu.findMany({
      where: { restaurantId: restaurant.id, isActive: true },
      include: {
        menuItems: {
          where: { isAvailable: true, showOnCustomerSite: true },
          include: { category: true, itemModifiers: { include: { modifierGroup: true } } },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    return { success: true, data: { restaurant, table: null, menus, settings: restaurant.settings } };
  });
  app.get('/:restaurantSlug/:tableToken/menu', async (request, reply) => {
    const { restaurantSlug, tableToken } = request.params as any;
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: restaurantSlug },
      select: { id: true, name: true, logo: true, settings: true },
    });
    if (!restaurant) return reply.status(404).send({ success: false, error: 'Restaurant not found' });

    const table = await prisma.table.findUnique({
      where: { qrToken: tableToken },
      include: { area: true, tableMenus: { where: { isActive: true }, select: { menuId: true } } },
    });
    if (!table || table.restaurantId !== restaurant.id) return reply.status(404).send({ success: false, error: 'Table not found' });

    const menuIds = table.tableMenus.map((tm) => tm.menuId);
    const menuWhere: any = { restaurantId: restaurant.id, isActive: true };
    if (menuIds.length > 0) menuWhere.id = { in: menuIds };

    const menus = await prisma.menu.findMany({
      where: menuWhere,
      include: {
        menuItems: {
          where: { isAvailable: true, showOnCustomerSite: true },
          include: { category: true, itemModifiers: { include: { modifierGroup: true } } },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    return { success: true, data: { restaurant, table: { id: table.id, name: table.name, area: table.area.name }, menus, settings: restaurant.settings } };
  });

  app.post('/:restaurantSlug/:tableToken/order', async (request, reply) => {
    const { restaurantSlug, tableToken } = request.params as any;
    const body = request.body as any;
    const restaurant = await prisma.restaurant.findUnique({ where: { slug: restaurantSlug } });
    if (!restaurant) return reply.status(404).send({ success: false, error: 'Restaurant not found' });
    const table = await prisma.table.findUnique({ where: { qrToken: tableToken } });
    if (!table) return reply.status(404).send({ success: false, error: 'Table not found' });

    const settings = await prisma.restaurantSettings.findUnique({ where: { restaurantId: restaurant.id } });
    const orderCount = await prisma.order.count({ where: { restaurantId: restaurant.id } });
    const orderNumber = `${settings?.orderPrefix || 'ORD'}-${String(orderCount + 1).padStart(5, '0')}`;

    // Calculate subtotal with modifiers
    let subtotal = 0;
    for (const item of body.items) {
      const mi = await prisma.menuItem.findUnique({ where: { id: item.menuItemId } });
      if (mi) {
        let itemTotal = Number(mi.price) * item.quantity;
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

    // Create order and KOT in transaction (use DB ids to generate stable numbers)
    const order = await prisma.$transaction(async (tx: any) => {
      const ord = await tx.order.create({
        data: {
          restaurantId: restaurant.id,
          tableId: table.id,
          orderNumber: `${settings?.orderPrefix || 'ORD'}-TEMP`,
          type: 'dine_in',
          subtotal,
          sgst,
          cgst,
          total,
          note: body.note,
        },
      });

      // finalize orderNumber using autoincrement id
      const finalOrderNumber = `${settings?.orderPrefix || 'ORD'}-${String(ord.id).padStart(5, '0')}`;
      await tx.order.update({ where: { id: ord.id }, data: { orderNumber: finalOrderNumber } });

      // Create KOT
      const kot = await tx.kOT.create({
        data: {
          orderId: ord.id,
          restaurantId: restaurant.id,
          kotNumber: `${settings?.kotPrefix || 'KOT'}-TEMP`,
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

      // finalize kot number
      const finalKotNumber = `${settings?.kotPrefix || 'KOT'}-${String(kot.id).padStart(5, '0')}`;
      await tx.kOT.update({ where: { id: kot.id }, data: { kotNumber: finalKotNumber } });

      // Update table status
      await tx.table.update({
        where: { id: table.id },
        data: { status: 'running' },
      });

      const refreshedKot = await tx.kOT.findUnique({ where: { id: kot.id }, include: { items: { include: { menuItem: true } } } });
      return { ...ord, kots: [refreshedKot] };
    });

    emitToRestaurant(restaurant.id, 'new_order', order);
    return { success: true, data: order };
  });

  app.post('/:restaurantSlug/:tableToken/waiter', async (request, reply) => {
    const { restaurantSlug, tableToken } = request.params as any;
    const restaurant = await prisma.restaurant.findUnique({ where: { slug: restaurantSlug } });
    if (!restaurant) return reply.status(404).send({ success: false, error: 'Restaurant not found' });
    const table = await prisma.table.findUnique({ where: { qrToken: tableToken } });
    if (!table) return reply.status(404).send({ success: false, error: 'Table not found' });

    const req = await prisma.waiterRequest.create({ data: { restaurantId: restaurant.id, tableId: table.id }, include: { table: true } });
    emitToRestaurant(restaurant.id, 'new_waiter_request', req);
    return { success: true, data: req };
  });

  app.get('/:restaurantSlug/:tableToken/status', async (request, reply) => {
    const { restaurantSlug, tableToken } = request.params as any;
    const restaurant = await prisma.restaurant.findUnique({ where: { slug: restaurantSlug } });
    if (!restaurant) return reply.status(404).send({ success: false, error: 'Restaurant not found' });
    const table = await prisma.table.findUnique({ where: { qrToken: tableToken } });
    if (!table) return reply.status(404).send({ success: false, error: 'Table not found' });

    const orders = await prisma.order.findMany({
      where: { restaurantId: restaurant.id, tableId: table.id, status: { notIn: ['paid', 'cancelled'] } },
      include: { kots: { include: { items: { include: { menuItem: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    return { success: true, data: orders };
  });
}
