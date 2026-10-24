import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { buildApp, prisma } from '../src/app.js';
import { setupSocketIO } from '../src/plugins/socket.js';

let app: Awaited<ReturnType<typeof buildApp>>;
const created: any = {};

before(async () => {
  app = await buildApp();
  // Provide a lightweight fake Socket.IO server so route emits do not throw during tests
  try {
    const fakeIo: any = {
      on: (_: string, __: any) => {},
      to: (_room: string) => ({ emit: (_event: string, _data: any) => {} }),
    };
    setupSocketIO(fakeIo);
  } catch (e) {
    // ignore
  }
});

after(async () => {
  try {
    if (created.restaurantId) {
      // Best-effort cleanup of created records for the test restaurant
      await prisma.bakeryToken.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
      await prisma.kOT.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
      await prisma.order.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
      await prisma.menuItem.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
      await prisma.menu.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
      await prisma.itemCategory.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
      await prisma.customer.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
      await prisma.branch.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
      await prisma.staff.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
      await prisma.inventoryMovement.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
      await prisma.inventoryItem.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
      await prisma.supplier.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
      await prisma.loyaltyTransaction.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
      await prisma.loyaltyProgram.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
      await prisma.mainPOSTerminal.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
      await prisma.subPOSTerminal.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
      await prisma.restaurantSettings.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
      await prisma.restaurant.deleteMany({ where: { id: created.restaurantId } }).catch(() => {});
    }
  } catch (err: any) {
    console.error('Cleanup error:', err?.message || err);
  } finally {
    await app.close();
    await prisma.$disconnect();
  }
});

test('E2E: POS + Reports + Inventory comprehensive', { timeout: 180_000 }, async () => {
  const unique = process.env.E2E_UNIQUE || `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const issues: string[] = [];

  console.log('E2E test starting', unique);

  // --- Fixtures (create core data via prisma for speed/reliability) ---
  const restaurant = await prisma.restaurant.create({
    data: {
      name: `E2E Test ${unique}`,
      slug: `e2e-${unique}`,
      email: `e2e-${unique}@example.com`,
      status: 'active',
      enabledModules: [],
    },
  });
  created.restaurantId = restaurant.id;

  const branch = await prisma.branch.create({ data: { restaurantId: restaurant.id, name: 'Main Branch', branchCode: `BR-${unique}`, isDefault: true, isActive: true } });

  const category = await prisma.itemCategory.create({ data: { restaurantId: restaurant.id, name: 'E2E Category', sortOrder: 1 } });
  const menu = await prisma.menu.create({ data: { restaurantId: restaurant.id, name: 'E2E Menu' } });

  const menuItemA = await prisma.menuItem.create({ data: { restaurantId: restaurant.id, menuId: menu.id, categoryId: category.id, name: 'Item A', price: '100', isAvailable: true } });
  const menuItemB = await prisma.menuItem.create({ data: { restaurantId: restaurant.id, menuId: menu.id, categoryId: category.id, name: 'Item B', price: '50', isAvailable: true } });

  // create staff and login via API
  const staffPassword = 'Pass@1234';
  const staffHash = await bcrypt.hash(staffPassword, 10);
  const staffEmail = `e2e-staff-${unique}@example.com`;
  await prisma.staff.create({ data: { restaurantId: restaurant.id, branchId: branch.id, name: 'E2E Manager', email: staffEmail, password: staffHash, role: 'restaurant_admin', isActive: true } });

  const loginResp = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: staffEmail, password: staffPassword } });
  if (loginResp.statusCode !== 200) { issues.push('Staff login failed'); }
  const loginJson = loginResp.json();
  const staffToken = loginJson.data?.token as string;
  if (!staffToken) issues.push('Staff token missing');

  // create Main POS terminal (API)
  const mainTerminalCode = `MAIN-${unique}`;
  const mainPin = '1234';
  const createMain = await app.inject({ method: 'POST', url: '/api/restaurant/pos-terminals/mainpos', headers: { authorization: `Bearer ${staffToken}` }, payload: { name: 'E2E Main POS', terminalCode: mainTerminalCode, pin: mainPin, branchId: branch.id } });
  if (createMain.statusCode !== 200) issues.push('Failed to create Main POS terminal');

  // login mainpos to get terminal token
  const mainLoginResp = await app.inject({ method: 'POST', url: '/api/mainpos/login', payload: { terminalCode: mainTerminalCode, pin: mainPin } });
  if (mainLoginResp.statusCode !== 200) issues.push('Main POS login failed');
  const mainLoginJson = mainLoginResp.json();
  const mainposToken = mainLoginJson.data?.token as string;
  if (!mainposToken) issues.push('Main POS token missing');

  // enable loyalty program so payments produce points
  await prisma.loyaltyProgram.create({ data: { restaurantId: restaurant.id, pointsPerRupee: '0.1', pointValue: '0.5', minClaimPoints: 1, maxClaimPercent: '100', isActive: true } });

  // --- MODULE 1: POS FLOW ---
  console.log('Module 1: POS flow - create token with customer');
  const createTokenResp = await app.inject({ method: 'POST', url: '/api/mainpos/token/create', headers: { authorization: `Bearer ${mainposToken}` }, payload: { items: [{ menuItemId: menuItemA.id, quantity: 1 }], customerName: 'John Doe', customerPhone: '9999999999' } });
  const createTokenJson = createTokenResp.json();
  if (createTokenResp.statusCode !== 200 || !createTokenJson?.success) {
    console.error('token.create failed:', createTokenJson || createTokenResp.body);
    issues.push('token.create API failed: ' + (createTokenJson?.error || createTokenResp.statusCode));
    throw new Error('Stopping E2E: token.create failed');
  }
  const createdToken = createTokenJson.data;
  if (!createdToken || !createdToken.qrCode) {
    issues.push('token object missing qrCode');
    throw new Error('Stopping E2E: token create returned invalid token');
  }

  // add items (bulk)
  const addItemsResp = await app.inject({ method: 'POST', url: `/api/mainpos/token/${createdToken.qrCode}/items/bulk`, headers: { authorization: `Bearer ${mainposToken}` }, payload: { items: [{ menuItemId: menuItemB.id, quantity: 2 }] } });
  if (addItemsResp.statusCode !== 200) issues.push('token.addItems bulk failed');
  const tokenAfterAdd = addItemsResp.json().data;
  const tokenTotal = Number(tokenAfterAdd.total || tokenAfterAdd.subtotal || 0);
  if (tokenTotal <= 0) issues.push('token total invalid after adding items');

  // make full cash payment
  const paymentResp = await app.inject({ method: 'POST', url: `/api/mainpos/token/${createdToken.qrCode}/payment`, headers: { authorization: `Bearer ${mainposToken}` }, payload: { method: 'cash', amount: tokenTotal } });
  if (paymentResp.statusCode !== 200) { issues.push('Payment endpoint failed'); }
  const paymentJson = paymentResp.json().data;
  const pointsEarned = paymentJson?.pointsEarned ?? 0;
  if (pointsEarned <= 0) issues.push('Expected points to be awarded on payment');

  // Retroactive awarding: create token without customer, pay, then attach customer
  console.log('Module 1: Retroactive loyalty awarding');
  const tokenNoCustResp = await app.inject({ method: 'POST', url: '/api/mainpos/token/create', headers: { authorization: `Bearer ${mainposToken}` }, payload: { items: [{ menuItemId: menuItemA.id, quantity: 1 }] } });
  const tokenNoCustJson = tokenNoCustResp.json();
  if (tokenNoCustResp.statusCode !== 200 || !tokenNoCustJson?.success) {
    console.error('token.create (no-customer) failed:', tokenNoCustJson || tokenNoCustResp.body);
    issues.push('Failed to create token without customer: ' + (tokenNoCustJson?.error || tokenNoCustResp.statusCode));
    throw new Error('Stopping E2E: create token without customer failed');
  }
  const tokenNoCust = tokenNoCustJson.data;
  const payNoCustResp = await app.inject({ method: 'POST', url: `/api/mainpos/token/${tokenNoCust.qrCode}/payment`, headers: { authorization: `Bearer ${mainposToken}` }, payload: { method: 'gpay', amount: Number(tokenNoCust.total || tokenNoCust.subtotal) } });
  if (payNoCustResp.statusCode !== 200) {
    console.error('Payment for token without customer failed:', payNoCustResp.json?.() || payNoCustResp.body);
    issues.push('Payment for token without customer failed');
    throw new Error('Stopping E2E: payment for token without customer failed');
  }

  const attachResp = await app.inject({ method: 'POST', url: `/api/mainpos/token/${tokenNoCust.qrCode}/customer`, headers: { authorization: `Bearer ${mainposToken}` }, payload: { customerName: 'Retro Customer', customerPhone: '8888888888' } });
  if (attachResp.statusCode !== 200) issues.push('Failed to attach customer after payment (retroactive)');
  const attachedToken = attachResp.json().data;
  const attachedCustomerId = attachedToken?.customer?.id;
  if (attachedCustomerId) {
    const attachedCustomer = await prisma.customer.findUnique({ where: { id: attachedCustomerId } });
    if (!attachedCustomer) issues.push('Attached customer not found in DB');
    if ((attachedCustomer?.totalOrders ?? 0) === 0) issues.push('Retroactive attachment did not increment totalOrders');
  } else {
    issues.push('Attached token did not include customer id');
  }

  // --- MODULE 2: REPORTS ---
  console.log('Module 2: Reports validation');
  const reportPaths = ['/api/restaurant/reports/sales', '/api/restaurant/reports/items', '/api/restaurant/reports/categories', '/api/restaurant/reports/tax', '/api/restaurant/reports/expenses', '/api/restaurant/reports/delivery-apps', '/api/restaurant/reports/cancelled-orders', '/api/restaurant/reports/removed-kot-items', '/api/restaurant/reports/due-payments'];
  for (const p of reportPaths) {
    const resp = await app.inject({ method: 'GET', url: p, headers: { authorization: `Bearer ${staffToken}` } });
    if (resp.statusCode !== 200) issues.push(`Report ${p} returned ${resp.statusCode}`);
    else {
      const j = resp.json();
      if (!j.success) issues.push(`Report ${p} returned success=false`);
    }
  }

  // --- MODULE 3: INVENTORY ---
  console.log('Module 3: Inventory lifecycle');
  const supResp = await app.inject({ method: 'POST', url: '/api/restaurant/inventory/suppliers', headers: { authorization: `Bearer ${staffToken}` }, payload: { name: 'E2E Supplier', outstandingBalance: 0 } });
  if (supResp.statusCode !== 200) issues.push('Supplier creation failed via API');
  const supplier = supResp.json().data;

  // Try create unit via API (may be missing) and fallback to prisma
  const createUnitResp = await app.inject({ method: 'POST', url: '/api/restaurant/inventory/units', headers: { authorization: `Bearer ${staffToken}` }, payload: { name: 'pcs', symbol: 'pcs' } });
  let unit: any;
  if (createUnitResp.statusCode === 404 || createUnitResp.statusCode === 501) {
    issues.push('Missing API endpoint: POST /api/restaurant/inventory/units - created unit via prisma to continue tests');
    unit = await prisma.inventoryUnit.create({ data: { restaurantId: restaurant.id, name: 'pcs', symbol: 'pcs' } });
  } else if (createUnitResp.statusCode === 200) {
    unit = createUnitResp.json().data;
  } else {
    issues.push('Unexpected response creating unit');
    unit = await prisma.inventoryUnit.create({ data: { restaurantId: restaurant.id, name: 'pcs', symbol: 'pcs' } });
  }

  // Try inventory category via API, fallback to prisma
  const createInvCatResp = await app.inject({ method: 'POST', url: '/api/restaurant/inventory/categories', headers: { authorization: `Bearer ${staffToken}` }, payload: { name: 'E2E Inv Cat' } });
  let invCategory: any;
  if (createInvCatResp.statusCode === 404 || createInvCatResp.statusCode === 501) {
    issues.push('Missing API endpoint: POST /api/restaurant/inventory/categories - created category via prisma to continue tests');
    invCategory = await prisma.inventoryItemCategory.create({ data: { restaurantId: restaurant.id, name: 'E2E Inv Cat' } });
  } else if (createInvCatResp.statusCode === 200) {
    invCategory = createInvCatResp.json().data;
  } else {
    issues.push('Unexpected response creating inventory category');
    invCategory = await prisma.inventoryItemCategory.create({ data: { restaurantId: restaurant.id, name: 'E2E Inv Cat' } });
  }

  // Create inventory item via API
  const invItemResp = await app.inject({ method: 'POST', url: '/api/restaurant/inventory/items', headers: { authorization: `Bearer ${staffToken}` }, payload: { name: 'Flour', categoryId: invCategory.id, unitId: unit.id, thresholdQty: 5, currentStock: 0, costPerUnit: 30 } });
  if (invItemResp.statusCode !== 200) {
    issues.push('Inventory item creation failed');
  }
  const inventoryItem = invItemResp.json().data;

  // Add stock via movements endpoint
  const movementResp = await app.inject({ method: 'POST', url: `/api/restaurant/inventory/items/${inventoryItem.id}/movements`, headers: { authorization: `Bearer ${staffToken}` }, payload: { type: 'purchase', quantity: 100, note: 'Initial stock' } });
  if (movementResp.statusCode !== 200) issues.push('Failed to add inventory movement');

  // Check movements list
  const movementsList = await app.inject({ method: 'GET', url: '/api/restaurant/inventory/movements', headers: { authorization: `Bearer ${staffToken}` } });
  if (movementsList.statusCode !== 200) issues.push('Inventory movements list API failed');

  // --- MODULE 4: INVENTORY REPORTS ---
  const invSummaryResp = await app.inject({ method: 'GET', url: '/api/restaurant/inventory/summary', headers: { authorization: `Bearer ${staffToken}` } });
  if (invSummaryResp.statusCode !== 200) issues.push('Inventory summary API failed');

  // --- MODULE 5: DASHBOARD VALIDATION ---
  const accountsResp = await app.inject({ method: 'GET', url: '/api/restaurant/accounts/summary', headers: { authorization: `Bearer ${staffToken}` } });
  if (accountsResp.statusCode !== 200) issues.push('Accounts summary API failed');

  // --- Logic Checks ---
  const salesResp = await app.inject({ method: 'GET', url: '/api/restaurant/reports/sales', headers: { authorization: `Bearer ${staffToken}` } });
  if (salesResp.statusCode === 200) {
    const sjson = salesResp.json();
    const totalSales = Number(sjson.data?.summary?.totalSales ?? 0);
    if (Number.isNaN(totalSales)) issues.push('Sales report totalSales is NaN');
  } else {
    issues.push('Sales report failed for logic validation');
  }

  // Detect a few important missing endpoints for inventory/purchase lifecycle
  const expectedEndpoints = [
    { method: 'POST', url: '/api/restaurant/inventory/units', note: 'Create unit' },
    { method: 'POST', url: '/api/restaurant/inventory/categories', note: 'Create inventory category' },
    { method: 'POST', url: '/api/restaurant/purchase-orders', note: 'Create purchase order' },
  ];
  for (const e of expectedEndpoints) {
    const resp = await app.inject({ method: e.method, url: e.url, headers: { authorization: `Bearer ${staffToken}` }, payload: {} });
    if (resp.statusCode === 404 || resp.statusCode === 501) {
      issues.push(`Missing API endpoint: ${e.method} ${e.url} — ${e.note}`);
    }
  }

  // Final verdict
  if (issues.length > 0) {
    console.error('❌ Issues found during E2E test:');
    for (const it of issues) console.error('- ' + it);
    throw new Error(`E2E: ${issues.length} issues detected. See logs above.`);
  } else {
    console.log('✅ All POS & Inventory tests passed successfully');
    console.log('Created restaurantId:', created.restaurantId);
    // Conditional self-delete: set E2E_SELF_DELETE=1 to remove this file after a successful run
    try {
      const filePath = fileURLToPath(import.meta.url);
      if (process.env.E2E_SELF_DELETE === '1') {
        fs.unlinkSync(filePath);
        console.log('Deleted test file', filePath);
      } else {
        console.log('E2E_SELF_DELETE not set; test file retained for stability.');
      }
    } catch (err: any) {
      console.warn('Could not delete test file:', err?.message || err);
    }
  }
});
