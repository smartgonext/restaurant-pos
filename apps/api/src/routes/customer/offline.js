import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveOfflineDataFile() {
  const candidates = [];
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, 'app.asar.unpacked', 'apps', 'api', 'offline-data.json'));
    candidates.push(path.join(process.resourcesPath, 'app.asar.unpacked', 'apps', 'api', 'src', 'offline-data.json'));
    candidates.push(path.join(process.resourcesPath, 'sqlite-template', 'offline-data.json'));
    candidates.push(path.join(process.resourcesPath, 'app.asar.unpacked', 'offline-data.json'));
  }
  candidates.push(path.join(__dirname, '..', '..', 'offline-data.json'));
  candidates.push(path.join(__dirname, '..', '..', '..', 'offline-data.json'));

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0];
}

const DATA_FILE = resolveOfflineDataFile();

function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (err) {
      console.warn('[offline-db] failed to load offline-data.json, regenerating defaults', err instanceof Error ? err.message : err);
    }
  }
  const defaultData = {
    nextIds: {
      restaurant: 2,
      area: 2,
      table: 2,
      menu: 2,
      menuItem: 5,
      category: 3,
      order: 1,
      kot: 1,
      waiterRequest: 1,
    },
    restaurants: [
      {
        id: 1,
        slug: 'the-spice-kitchen',
        name: 'The Spice Kitchen',
        logo: '',
        settings: {
          currency: 'USD',
          currencySymbol: '$',
          sgstRate: 0,
          cgstRate: 0,
          orderPrefix: 'ORD',
          kotPrefix: 'KOT',
          customerSiteConfig: {},
        },
      },
    ],
    areas: [{ id: 1, restaurantId: 1, name: 'Main Dining' }],
    tables: [
      {
        id: 1,
        areaId: 1,
        restaurantId: 1,
        name: 'Table 1',
        qrToken: 'demo-table-1',
        isActive: true,
        status: 'available',
      },
    ],
    itemCategories: [
      { id: 1, restaurantId: 1, name: 'Starters' },
      { id: 2, restaurantId: 1, name: 'Main Course' },
    ],
    menus: [
      { id: 1, restaurantId: 1, name: 'All Day Menu', description: 'A sample offline menu', isActive: true, sortOrder: 1 },
    ],
    menuItems: [
      {
        id: 1,
        restaurantId: 1,
        menuId: 1,
        categoryId: 1,
        name: 'Spicy Paneer',
        description: 'Cottage cheese in spicy sauce',
        price: 12.99,
        image: '',
        isAvailable: true,
        showOnCustomerSite: true,
        sortOrder: 1,
        modifiers: [],
      },
      {
        id: 2,
        restaurantId: 1,
        menuId: 1,
        categoryId: 1,
        name: 'Garlic Naan',
        description: 'Oven-baked garlic naan',
        price: 3.99,
        image: '',
        isAvailable: true,
        showOnCustomerSite: true,
        sortOrder: 2,
        modifiers: [],
      },
      {
        id: 3,
        restaurantId: 1,
        menuId: 1,
        categoryId: 2,
        name: 'Butter Chicken',
        description: 'Creamy tomato-based chicken curry',
        price: 14.99,
        image: '',
        isAvailable: true,
        showOnCustomerSite: true,
        sortOrder: 3,
        modifiers: [],
      },
      {
        id: 4,
        restaurantId: 1,
        menuId: 1,
        categoryId: 2,
        name: 'Vegetable Biryani',
        description: 'Aromatic rice with fresh vegetables',
        price: 11.49,
        image: '',
        isAvailable: true,
        showOnCustomerSite: true,
        sortOrder: 4,
        modifiers: [],
      },
    ],
    tableMenus: [{ id: 1, tableId: 1, menuId: 1, isActive: true }],
    orders: [],
    kots: [],
    waiterRequests: [],
  };
  saveData(defaultData);
  return defaultData;
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

const db = loadData();

function findRestaurantBySlug(slug) {
  return db.restaurants.find((restaurant) => restaurant.slug === slug);
}

function findTableByToken(tableToken) {
  if (!tableToken) return undefined;
  const decoded = decodeURIComponent(tableToken);
  return db.tables.find((table) => table.qrToken === tableToken || table.qrToken === decoded);
}

function findTableById(tableId) {
  return db.tables.find((table) => String(table.id) === String(tableId));
}

function getTableMenuIds(table) {
  return db.tableMenus.filter((tm) => tm.tableId === table.id && tm.isActive).map((tm) => tm.menuId);
}

function getCategoryById(categoryId) {
  return db.itemCategories.find((category) => category.id === categoryId) || null;
}

function getMenuItems(restaurantId, menuId) {
  return db.menuItems
    .filter((item) => item.restaurantId === restaurantId && item.menuId === menuId && item.isAvailable && item.showOnCustomerSite)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    .map((item) => ({
      ...item,
      category: getCategoryById(item.categoryId),
      itemModifiers: item.modifiers || [],
    }));
}

function getMenusForRestaurant(restaurantId, menuIds) {
  const menus = db.menus
    .filter((menu) => menu.restaurantId === restaurantId && menu.isActive && (!menuIds || menuIds.length === 0 || menuIds.includes(menu.id)))
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  return menus.map((menu) => ({
    ...menu,
    menuItems: getMenuItems(restaurantId, menu.id),
  }));
}

function resolveTable(tableToken, query) {
  let table = findTableByToken(tableToken);
  if (!table && query?.table) {
    table = findTableById(query.table);
  }
  if (!table) {
    table = db.tables.find((t) => t.isActive) || null;
  }
  return table;
}

function calculateTotals(items, settings) {
  let subtotal = 0;
  const lineItems = items.map((item) => {
    const menuItem = db.menuItems.find((mi) => String(mi.id) === String(item.menuItemId));
    const quantity = Number(item.quantity) || 1;
    const modifiers = Array.isArray(item.modifiers) ? item.modifiers : [];
    const itemPrice = menuItem ? Number(menuItem.price || 0) : 0;
    const modifiersTotal = modifiers.reduce((sum, modifier) => sum + Number(modifier.price || 0), 0);
    const lineTotal = Number(((itemPrice + modifiersTotal) * quantity).toFixed(2));
    subtotal += lineTotal;
    return {
      menuItemId: menuItem?.id ?? item.menuItemId,
      name: menuItem?.name || item.name || 'Unknown item',
      quantity,
      price: itemPrice,
      modifiers,
      note: item.note || null,
      total: lineTotal,
    };
  });
  const sgstRate = Number(settings?.sgstRate || 0);
  const cgstRate = Number(settings?.cgstRate || 0);
  const sgst = Number((subtotal * (sgstRate / 100)).toFixed(2));
  const cgst = Number((subtotal * (cgstRate / 100)).toFixed(2));
  const total = Number((subtotal + sgst + cgst).toFixed(2));
  return { subtotal, sgst, cgst, total, lineItems };
}

function createOrder(table, restaurant, body) {
  const settings = restaurant.settings || {};
  const totals = calculateTotals(body.items, settings);
  const orderId = db.nextIds.order++;
  const orderNumber = `${settings.orderPrefix || 'ORD'}-${String(orderId).padStart(5, '0')}`;
  const kotId = db.nextIds.kot++;
  const kotNumber = `${settings.kotPrefix || 'KOT'}-${String(kotId).padStart(5, '0')}`;
  const kotItems = totals.lineItems.map((item) => ({
    id: `${kotId}-${item.menuItemId}`,
    menuItemId: item.menuItemId,
    quantity: item.quantity,
    price: item.price,
    modifiers: item.modifiers,
    note: item.note,
    total: item.total,
  }));
  const kot = {
    id: kotId,
    orderId,
    restaurantId: restaurant.id,
    kotNumber,
    createdAt: new Date().toISOString(),
    items: kotItems,
  };
  const order = {
    id: orderId,
    restaurantId: restaurant.id,
    tableId: table.id,
    orderNumber,
    type: 'dine_in',
    subtotal: totals.subtotal,
    sgst: totals.sgst,
    cgst: totals.cgst,
    total: totals.total,
    note: body.note || null,
    status: 'pending',
    createdAt: new Date().toISOString(),
    kots: [kot],
  };
  db.kots.push(kot);
  db.orders.push(order);
  table.status = 'running';
  saveData(db);
  return order;
}

export async function customerRoutes(app) {
  app.get('/:restaurantSlug/preview/menu', async (request, reply) => {
    const { restaurantSlug } = request.params;
    const restaurant = findRestaurantBySlug(restaurantSlug);
    if (!restaurant)
      return reply.status(404).send({ success: false, error: 'Restaurant not found' });
    const menus = getMenusForRestaurant(restaurant.id);
    return { success: true, data: { restaurant, table: null, menus, settings: restaurant.settings } };
  });

  app.get('/:restaurantSlug/:tableToken/menu', async (request, reply) => {
    const { restaurantSlug, tableToken } = request.params;
    const restaurant = findRestaurantBySlug(restaurantSlug);
    if (!restaurant)
      return reply.status(404).send({ success: false, error: 'Restaurant not found' });
    const table = resolveTable(tableToken, request.query);
    if (!table || table.restaurantId !== restaurant.id)
      return reply.status(404).send({ success: false, error: 'Table not found' });
    const menuIds = getTableMenuIds(table);
    const menus = getMenusForRestaurant(restaurant.id, menuIds);
    return {
      success: true,
      data: {
        restaurant,
        table: {
          id: table.id,
          name: table.name,
          area: db.areas.find((area) => area.id === table.areaId)?.name || null,
        },
        menus,
        settings: restaurant.settings,
      },
    };
  });

  app.get('/by-table/:tableToken/menu', async (request, reply) => {
    const { tableToken } = request.params;
    const table = resolveTable(tableToken, request.query);
    if (!table) return reply.status(404).send({ success: false, error: 'Table not found' });
    const restaurant = db.restaurants.find((rest) => rest.id === table.restaurantId);
    if (!restaurant) return reply.status(404).send({ success: false, error: 'Restaurant not found' });
    const menuIds = getTableMenuIds(table);
    const menus = getMenusForRestaurant(restaurant.id, menuIds);
    return {
      success: true,
      data: {
        restaurant,
        table: {
          id: table.id,
          name: table.name,
          area: db.areas.find((area) => area.id === table.areaId)?.name || null,
        },
        menus,
        settings: restaurant.settings,
      },
    };
  });

  app.post('/by-table/:tableToken/order', async (request, reply) => {
    const { tableToken } = request.params;
    const body = request.body;
    if (!body || !Array.isArray(body.items) || body.items.length === 0) {
      return reply.status(400).send({ success: false, error: 'Invalid order payload: items required' });
    }
    const table = resolveTable(tableToken, request.query);
    if (!table) return reply.status(404).send({ success: false, error: 'Table not found' });
    const restaurant = db.restaurants.find((rest) => rest.id === table.restaurantId);
    if (!restaurant) return reply.status(404).send({ success: false, error: 'Restaurant not found' });
    try {
      const order = createOrder(table, restaurant, body);
      return { success: true, data: order };
    } catch (err) {
      return reply.status(500).send({ success: false, error: err instanceof Error ? err.message : 'Failed to create order' });
    }
  });

  app.post('/by-table/:tableToken/waiter', async (request, reply) => {
    const { tableToken } = request.params;
    const table = resolveTable(tableToken, request.query);
    if (!table) return reply.status(404).send({ success: false, error: 'Table not found' });
    const restaurant = db.restaurants.find((rest) => rest.id === table.restaurantId);
    if (!restaurant) return reply.status(404).send({ success: false, error: 'Restaurant not found' });
    const requestId = db.nextIds.waiterRequest++;
    const waiterRequest = {
      id: requestId,
      restaurantId: restaurant.id,
      tableId: table.id,
      createdAt: new Date().toISOString(),
      table: { id: table.id, name: table.name },
    };
    db.waiterRequests.push(waiterRequest);
    saveData(db);
    return { success: true, data: waiterRequest };
  });

  app.get('/by-table/:tableToken/status', async (request, reply) => {
    const { tableToken } = request.params;
    const table = resolveTable(tableToken, request.query);
    if (!table) return reply.status(404).send({ success: false, error: 'Table not found' });
    const orders = db.orders
      .filter((order) => order.tableId === table.id && !['paid', 'cancelled'].includes(order.status))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return { success: true, data: orders };
  });

  app.post('/:restaurantSlug/:tableToken/order', async (request, reply) => {
    const { restaurantSlug, tableToken } = request.params;
    const body = request.body;
    if (!body || !Array.isArray(body.items) || body.items.length === 0) {
      return reply.status(400).send({ success: false, error: 'Invalid order payload: items required' });
    }
    const restaurant = findRestaurantBySlug(restaurantSlug);
    if (!restaurant) return reply.status(404).send({ success: false, error: 'Restaurant not found' });
    const table = resolveTable(tableToken, request.query);
    if (!table || table.restaurantId !== restaurant.id) return reply.status(404).send({ success: false, error: 'Table not found' });
    try {
      const order = createOrder(table, restaurant, body);
      return { success: true, data: order };
    } catch (err) {
      return reply.status(500).send({ success: false, error: err instanceof Error ? err.message : 'Failed to create order' });
    }
  });

  app.post('/:restaurantSlug/:tableToken/waiter', async (request, reply) => {
    const { restaurantSlug, tableToken } = request.params;
    const restaurant = findRestaurantBySlug(restaurantSlug);
    if (!restaurant) return reply.status(404).send({ success: false, error: 'Restaurant not found' });
    const table = resolveTable(tableToken, request.query);
    if (!table || table.restaurantId !== restaurant.id) return reply.status(404).send({ success: false, error: 'Table not found' });
    const requestId = db.nextIds.waiterRequest++;
    const waiterRequest = {
      id: requestId,
      restaurantId: restaurant.id,
      tableId: table.id,
      createdAt: new Date().toISOString(),
      table: { id: table.id, name: table.name },
    };
    db.waiterRequests.push(waiterRequest);
    saveData(db);
    return { success: true, data: waiterRequest };
  });

  app.get('/:restaurantSlug/:tableToken/status', async (request, reply) => {
    const { restaurantSlug, tableToken } = request.params;
    const restaurant = findRestaurantBySlug(restaurantSlug);
    if (!restaurant) return reply.status(404).send({ success: false, error: 'Restaurant not found' });
    const table = resolveTable(tableToken, request.query);
    if (!table || table.restaurantId !== restaurant.id) return reply.status(404).send({ success: false, error: 'Table not found' });
    const orders = db.orders
      .filter((order) => order.tableId === table.id && !['paid', 'cancelled'].includes(order.status))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return { success: true, data: orders };
  });
}
