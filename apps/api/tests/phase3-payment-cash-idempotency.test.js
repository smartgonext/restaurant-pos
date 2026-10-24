import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { buildApp, prisma } from '../src/app.js';
import { setupSocketIO } from '../src/plugins/socket.js';

let app;
const created = {};

before(async () => {
    app = await buildApp();
    try {
        const fakeIo = {
            on: () => {},
            to: () => ({ emit: () => {} }),
        };
        setupSocketIO(fakeIo);
    } catch {
        // ignore socket setup in test runner
    }
});

after(async () => {
    try {
        if (created.restaurantId) {
            const rId = created.restaurantId;
            await prisma.cashRegisterSession.deleteMany({ where: { register: { restaurantId: rId } } }).catch(() => {});
            await prisma.cashRegister.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.orderPayment.deleteMany({ where: { order: { restaurantId: rId } } }).catch(() => {});
            await prisma.kOTItem.deleteMany({ where: { kot: { restaurantId: rId } } }).catch(() => {});
            await prisma.kOT.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.order.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.table.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.area.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.menuItem.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.itemCategory.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.menu.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.staff.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.branch.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.restaurant.deleteMany({ where: { id: rId } }).catch(() => {});
        }
    } finally {
        await app.close();
        await prisma.$disconnect();
    }
});

test('Phase 3: Multi-Pay Split Settlement, Refund Engine, Cash Register & Idempotency', { timeout: 60_000 }, async () => {
    const unique = `phase3-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    // 1. Setup Tenant, Branch, Staff
    const restaurant = await prisma.restaurant.create({
        data: {
            name: `Phase3 Resto ${unique}`,
            slug: `phase3-${unique}`,
            email: `p3-${unique}@resto.com`,
            status: 'active',
            enabledModules: '[]',
        },
    });
    created.restaurantId = restaurant.id;

    const branch = await prisma.branch.create({
        data: { restaurantId: restaurant.id, name: 'Phase 3 Branch', branchCode: `B3-${unique}`, isDefault: true },
    });

    const staffPass = 'Pass123!';
    const staffHash = await bcrypt.hash(staffPass, 10);
    const staff = await prisma.staff.create({
        data: {
            restaurantId: restaurant.id,
            branchId: branch.id,
            name: 'Phase 3 Cashier',
            email: `csh-${unique}@resto.com`,
            password: staffHash,
            role: 'restaurant_admin',
            isActive: true,
        },
    });

    const loginResp = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: staff.email, password: staffPass },
    });
    assert.equal(loginResp.statusCode, 200);
    const token = loginResp.json().data?.token;
    const authHeader = { authorization: `Bearer ${token}` };

    // 2. Setup Area, Table, Menu, Item
    const area = await prisma.area.create({ data: { restaurantId: restaurant.id, branchId: branch.id, name: 'Main Hall', sortOrder: 1 } });
    const table = await prisma.table.create({ data: { restaurantId: restaurant.id, areaId: area.id, name: 'T10', capacity: 4, status: 'available' } });
    const menu = await prisma.menu.create({ data: { restaurantId: restaurant.id, name: 'Main Menu' } });
    const category = await prisma.itemCategory.create({ data: { restaurantId: restaurant.id, name: 'Starters', isKOTEnabled: true } });
    const item = await prisma.menuItem.create({ data: { restaurantId: restaurant.id, menuId: menu.id, categoryId: category.id, name: 'Starter Combo', price: 500 } });

    // 3. Create Order
    const createOrderResp = await app.inject({
        method: 'POST',
        url: '/api/restaurant/orders',
        headers: authHeader,
        payload: {
            tableId: table.id,
            pax: 2,
            items: [{ menuItemId: item.id, quantity: 1 }]
        }
    });
    assert.equal(createOrderResp.statusCode, 200);
    const order = createOrderResp.json().data;

    // 4. TEST MULTI-PAY SPLIT SETTLEMENT (e.g. 300 Cash + 200 UPI = 500 Total)
    const splitPayResp = await app.inject({
        method: 'POST',
        url: `/api/restaurant/orders/${order.id}/payments/split`,
        headers: authHeader,
        payload: {
            payments: [
                { method: 'cash', amount: 300 },
                { method: 'upi', amount: 200, reference: 'UPI-TXN-12345' }
            ]
        }
    });
    assert.equal(splitPayResp.statusCode, 200, 'Split payment failed');
    const settledOrder = splitPayResp.json().data?.order;
    assert.equal(settledOrder.status, 'completed');
    assert.equal(settledOrder.payments.length, 2);

    // Verify table freed to available
    const tableAfter = await prisma.table.findUnique({ where: { id: table.id } });
    assert.equal(tableAfter.status, 'available');

    // 5. TEST REFUND ENGINE (Full refund authorization)
    const refundResp = await app.inject({
        method: 'POST',
        url: `/api/restaurant/orders/${order.id}/refund`,
        headers: authHeader,
        payload: { refundAmount: 500, reason: 'Wrong item order' }
    });
    assert.equal(refundResp.statusCode, 200, 'Refund failed');
    assert.equal(refundResp.json().data?.order?.status, 'refunded');

    // 6. TEST CASH REGISTER SESSION & CASH IN / CASH OUT
    const openRegisterResp = await app.inject({
        method: 'POST',
        url: '/api/restaurant/cash-register/open',
        headers: authHeader,
        payload: { openingBalance: 1000, notes: 'Morning Shift' }
    });
    assert.equal(openRegisterResp.statusCode, 200, 'Register open failed');

    const cashInOutResp = await app.inject({
        method: 'POST',
        url: '/api/restaurant/cash-register/cash-in-out',
        headers: authHeader,
        payload: { type: 'cash_out', amount: 150, reason: 'Petty cash milk purchase' }
    });
    assert.equal(cashInOutResp.statusCode, 200, 'Cash in/out failed');

    const closeRegisterResp = await app.inject({
        method: 'POST',
        url: '/api/restaurant/cash-register/close',
        headers: authHeader,
        payload: { closingBalance: 850, notes: 'Evening Close' }
    });
    assert.equal(closeRegisterResp.statusCode, 200, 'Register close failed');

    // 7. TEST IDEMPOTENCY KEY PROTECTION (Duplicate request Prevention)
    const idempotencyKey = `idemp-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const reqHeaders = { ...authHeader, 'idempotency-key': idempotencyKey };

    const firstReq = await app.inject({
        method: 'POST',
        url: `/api/restaurant/tables/${table.id}/reopen`,
        headers: reqHeaders,
    });
    assert.equal(firstReq.statusCode, 200);

    const duplicateReq = await app.inject({
        method: 'POST',
        url: `/api/restaurant/tables/${table.id}/reopen`,
        headers: reqHeaders,
    });
    assert.equal(duplicateReq.statusCode, 200);
    assert.deepEqual(duplicateReq.json(), firstReq.json(), 'Idempotency response mismatch');

    console.log('✅ Phase 3 Multi-Pay Split, Refunds, Cash Register & Idempotency tests passed 100% cleanly!');
});
