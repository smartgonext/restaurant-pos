import http from 'http';
import { buildApp, prisma } from '../src/app.js';

// Configuration
const ERP_PORT = 5000;
const ERP_BASE_URL = `http://localhost:${ERP_PORT}`;
const API_KEY = 'mock-erp-api-key';

// Mock ERP Data Store
const erpDb = {
  products: [
    { product_id: 101, name: 'Bakers Vanilla Tub', sku: 'BVT-101', selling_price: 120, ready_stock: 10 }
  ],
  dispatches: [],
  nextDispatchId: 8888
};

// 1. Start the Mock ERP Server (Using Node http)
const erpServer = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const method = req.method;
  
  // Verify API Key
  const key = req.headers['x-api-key'];
  if (key !== API_KEY) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized key' }));
    return;
  }

  let pathname = url.pathname;
  if (pathname.startsWith('/api/v1')) {
    pathname = pathname.substring(7);
  }

  // Parse Body if POST
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    let payload = {};
    if (body) {
      try { payload = JSON.parse(body); } catch (e) {}
    }

    // Router
    if (method === 'GET' && pathname === '/store/products') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: erpDb.products }));
      return;
    }

    if (method === 'POST' && pathname === '/store/dispatch') {
      const items = payload.items || [];
      const lines = [];

      for (const reqItem of items) {
        const prod = erpDb.products.find(p => p.product_id === reqItem.product_id);
        if (!prod || prod.ready_stock < reqItem.qty) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Insufficient stock or invalid product' }));
          return;
        }
        prod.ready_stock -= reqItem.qty;
        lines.push({
          product_id: prod.product_id,
          product_name: prod.name,
          sku: prod.sku,
          qty: reqItem.qty,
          selling_price: prod.selling_price
        });
      }

      const dispatch = {
        id: erpDb.nextDispatchId++,
        dispatch_ref: `DSP-MOCK-${erpDb.nextDispatchId}`,
        receivable_lines: lines
      };
      erpDb.dispatches.push(dispatch);

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: dispatch }));
      return;
    }

    if (method === 'POST' && pathname.startsWith('/store/dispatches/')) {
      const parts = pathname.split('/');
      const id = parseInt(parts[3], 10);
      const isReceive = parts[4] === 'receive';

      if (isReceive) {
        const dispatch = erpDb.dispatches.find(d => d.id === id);
        if (dispatch) {
          dispatch.received = true;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
          return;
        }
      }
    }

    // Default Not Found
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });
});

// 2. Run Test Suite
async function runTests() {
  console.log('🚀 Starting end-to-end ERP integration tests...');

  // Start ERP Server
  await new Promise(resolve => erpServer.listen(ERP_PORT, resolve));
  console.log(`✅ Mock ERP Server running at ${ERP_BASE_URL}`);

  // Build Fastify App
  const app = await buildApp();
  await app.ready();
  console.log('✅ Local Restaurant POS Fastify instance ready');

  try {
    // Cleanup previous test runs
    await prisma.erpAppliedDispatch.deleteMany({
      where: { dispatchId: { gte: 8000 } }
    });
    await prisma.menuItem.deleteMany({
      where: { name: 'Bakers Vanilla Tub' }
    });
    await prisma.inventoryItem.deleteMany({
      where: { sku: 'BVT-101' }
    });
    console.log('🧹 Cleaned up old test data from database.');
    // A. Setup test database records
    let restaurant = await prisma.restaurant.findFirst();
    if (!restaurant) {
      restaurant = await prisma.restaurant.create({
        data: {
          name: 'Test Sync Restaurant',
          slug: 'test-sync-restaurant',
          businessType: 'restaurant'
        }
      });
      console.log(`Created test Restaurant ID: ${restaurant.id}`);
    } else {
      console.log(`Using existing Restaurant ID: ${restaurant.id}`);
    }

    let menu = await prisma.menu.findFirst({ where: { restaurantId: restaurant.id } });
    if (!menu) {
      menu = await prisma.menu.create({
        data: {
          restaurantId: restaurant.id,
          name: 'Main Menu',
          isActive: true
        }
      });
      console.log(`Created test active Menu ID: ${menu.id}`);
    }

    // Generate JWT token bypass auth
    const token = app.jwt.sign({
      id: 999,
      restaurantId: restaurant.id,
      role: 'admin'
    });
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    console.log('\n--- Test 1: Configure ERP Connection ---');
    const configRes = await app.inject({
      method: 'POST',
      url: '/api/restaurant/erp-store/config',
      headers,
      payload: {
        baseUrl: ERP_BASE_URL,
        apiKey: API_KEY
      }
    });

    console.log('Config Response Status:', configRes.statusCode);
    const configData = JSON.parse(configRes.body);
    console.log('Saved Config Data:', configData);
    if (configRes.statusCode !== 200 || !configData.success) {
      throw new Error('Test 1 failed: Configuration post rejected');
    }

    console.log('\n--- Test 2: Fetch Ready Products ---');
    const productsRes = await app.inject({
      method: 'GET',
      url: '/api/restaurant/erp-store/ready-products',
      headers
    });

    console.log('Products Response Status:', productsRes.statusCode);
    const productsData = JSON.parse(productsRes.body);
    console.log('Available Products:', productsData.data);
    if (productsRes.statusCode !== 200 || productsData.data.length === 0) {
      throw new Error('Test 2 failed: Could not fetch ERP products');
    }

    console.log('\n--- Test 3: Request Dispatch / Stock Transfer of 4 items ---');
    const initialERPReadyStock = erpDb.products[0].ready_stock;
    console.log(`Initial ERP Ready Stock: ${initialERPReadyStock}`);

    const transferRes = await app.inject({
      method: 'POST',
      url: '/api/restaurant/erp-store/dispatch',
      headers,
      payload: {
        items: [{ product_id: 101, qty: 4 }]
      }
    });

    console.log('Transfer Response Status:', transferRes.statusCode);
    const transferData = JSON.parse(transferRes.body);
    console.log('Transfer Response Body:', transferRes.body);
    console.log('Dispatch Details:', transferData.data);
    if (transferRes.statusCode !== 200 || !transferData.success) {
      throw new Error(`Test 3 failed: Dispatch request failed. Error: ${transferRes.body}`);
    }

    console.log('\n--- Test 4: Validate stock updates on both sides ---');
    // Check ERP side
    const finalERPReadyStock = erpDb.products[0].ready_stock;
    console.log(`Final ERP Ready Stock (expecting 6): ${finalERPReadyStock}`);
    if (finalERPReadyStock !== 6) {
      throw new Error(`ERP stock mismatch: expected 6, got ${finalERPReadyStock}`);
    }

    // Check POS side
    const localItem = await prisma.inventoryItem.findFirst({
      where: { sku: 'BVT-101', restaurantId: restaurant.id }
    });
    console.log('Local POS Inventory Item Stock (expecting 4):', Number(localItem?.currentStock));
    if (!localItem || Number(localItem.currentStock) !== 4) {
      throw new Error(`Local POS stock mismatch: expected 4, got ${Number(localItem?.currentStock)}`);
    }

    // Check if Menu Item was successfully synced
    const localMenuItem = await prisma.menuItem.findFirst({
      where: { inventoryItemId: localItem.id, restaurantId: restaurant.id }
    });
    console.log('Synced Menu Item Name:', localMenuItem?.name);
    console.log('Synced Menu Item Price:', localMenuItem?.price);
    if (!localMenuItem) {
      throw new Error('Dual POS Menu sync failed: menuItem not created');
    }

    // Check applied dispatches ledger
    const appliedRecord = await prisma.erpAppliedDispatch.findFirst({
      where: { dispatchId: transferData.data.id, restaurantId: restaurant.id }
    });
    console.log('Applied dispatch record created:', appliedRecord ? 'YES' : 'NO');
    if (!appliedRecord) {
      throw new Error('Audit ledger mismatch: erpAppliedDispatch record missing');
    }

    // Check Audit logs
    const auditRecord = await prisma.auditLog.findFirst({
      where: { action: 'ERP_DISPATCH_SYNC', restaurantId: restaurant.id }
    });
    console.log('Audit Log Action created:', auditRecord ? 'YES' : 'NO');
    console.log('Audit Log Details:', auditRecord?.details);
    if (!auditRecord) {
      throw new Error('Audit Log mismatch: ERP_DISPATCH_SYNC log not created');
    }

    console.log('\n🎉 ALL INTEGRATION TESTS PASSED PERFECTLY!');
  } catch (error) {
    console.error('\n❌ TEST SUITE FAILURE:', error);
    process.exitCode = 1;
  } finally {
    // Cleanup HTTP servers and Prisma connection
    await new Promise(resolve => erpServer.close(resolve));
    await app.close();
    await prisma.$disconnect();
    console.log('🔌 Mock ERP and local Fastify app closed. Exit.');
  }
}

// Execute
runTests();
