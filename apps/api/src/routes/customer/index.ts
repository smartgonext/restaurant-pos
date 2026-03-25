import { FastifyInstance } from 'fastify';
import { prisma } from '../../app.js';
import { emitToRestaurant } from '../../plugins/socket.js';

export async function customerRoutes(app: FastifyInstance) {
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

    let subtotal = 0;
    for (const item of body.items) {
      const mi = await prisma.menuItem.findUnique({ where: { id: item.menuItemId } });
      if (mi) subtotal += Number(mi.price) * item.quantity;
    }
    const sgst = subtotal * (Number(settings?.sgstRate || 0) / 100);
    const cgst = subtotal * (Number(settings?.cgstRate || 0) / 100);

    const order = await prisma.order.create({
      data: { restaurantId: restaurant.id, tableId: table.id, orderNumber, type: 'dine_in', subtotal, sgst, cgst, total: subtotal + sgst + cgst, note: body.note },
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
