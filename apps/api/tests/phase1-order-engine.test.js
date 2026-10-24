import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
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
            await prisma.kOTItem.deleteMany({ where: { kot: { restaurantId: rId } } }).catch(() => {});
            await prisma.kOT.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.orderPayment.deleteMany({ where: { order: { restaurantId: rId } } }).catch(() => {});
            await prisma.order.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.table.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.area.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.menuItem.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.itemCategory.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.menu.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.customer.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.staff.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.branch.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.restaurant.deleteMany({ where: { id: rId } }).catch(() => {});
        }
    } finally {
        await app.close();
        await prisma.$disconnect();
    }
});

test('Phase 1: Order Core Engine & Table/Customer State Operations', { timeout: 60_000 }, async () => {
    const unique = `phase1-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    // 1. Setup Tenant, Branch, Staff
    const restaurant = await prisma.restaurant.create({
        data: {
            name: `Phase1 Resto ${unique}`,
            slug: `phase1-${unique}`,
            email: `p1-${unique}@resto.com`,
            status: 'active',
            enabledModules: '[]',
        },
    });
    created.restaurantId = restaurant.id;

    const branch = await prisma.branch.create({
        data: { restaurantId: restaurant.id, name: 'Phase 1 Branch', branchCode: `B1-${unique}`, isDefault: true },
    });

    const staffPass = 'Pass123!';
    const staffHash = await bcrypt.hash(staffPass, 10);
    const staff = await prisma.staff.create({
        data: {
            restaurantId: restaurant.id,
            branchId: branch.id,
            name: 'Phase 1 Manager',
            email: `mgr-${unique}@resto.com`,
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

    // 2. Setup Dining Area & 2 Tables
    const area = await prisma.area.create({
        data: { restaurantId: restaurant.id, branchId: branch.id, name: 'Main Dining', sortOrder: 1 },
    });
    const table1 = await prisma.table.create({
        data: { restaurantId: restaurant.id, areaId: area.id, name: 'T1', capacity: 4, status: 'available' },
    });
    const table2 = await prisma.table.create({
        data: { restaurantId: restaurant.id, areaId: area.id, name: 'T2', capacity: 4, status: 'available' },
    });

    // 3. Setup Menu & Category & Item
    const menu = await prisma.menu.create({ data: { restaurantId: restaurant.id, name: 'Standard Menu' } });
    const category = await prisma.itemCategory.create({ data: { restaurantId: restaurant.id, name: 'Food', isKOTEnabled: true } });
    const menuItem1 = await prisma.menuItem.create({
        data: { restaurantId: restaurant.id, menuId: menu.id, categoryId: category.id, name: 'Pasta Arrabbiata', price: 200 },
    });
    const menuItem2 = await prisma.menuItem.create({
        data: { restaurantId: restaurant.id, menuId: menu.id, categoryId: category.id, name: 'Garlic Bread', price: 100 },
    });

    // 4. Setup Customer
    const customer = await prisma.customer.create({
        data: { restaurantId: restaurant.id, name: 'Bob Smith', phone: '9123456789', loyaltyPoints: 10 },
    });

    // 5. Create Order 1 on Table 1
    const createOrder1Resp = await app.inject({
        method: 'POST',
        url: '/api/restaurant/orders',
        headers: authHeader,
        payload: {
            tableId: table1.id,
            customerId: customer.id,
            pax: 2,
            items: [
                { menuItemId: menuItem1.id, quantity: 2 },
                { menuItemId: menuItem2.id, quantity: 1 },
            ],
        },
    });
    assert.equal(createOrder1Resp.statusCode, 200, 'Create order 1 failed');
    const order1 = createOrder1Resp.json().data;
    assert.equal(order1.tableId, table1.id);
    assert.equal(Number(order1.subtotal), 500); // (200*2) + (100*1)

    // Verify Table 1 status becomes 'occupied'
    const table1Db = await prisma.table.findUnique({ where: { id: table1.id } });
    assert.equal(table1Db.status, 'occupied');

    // 6. TEST OPERATIONAL EXCEPTION: Transfer Order 1 from Table 1 -> Table 2
    const transferResp = await app.inject({
        method: 'POST',
        url: `/api/restaurant/orders/${order1.id}/transfer-table`,
        headers: authHeader,
        payload: { targetTableId: table2.id },
    });
    assert.equal(transferResp.statusCode, 200, 'Transfer table failed');
    const transferredOrder = transferResp.json().data;
    assert.equal(transferredOrder.tableId, table2.id);

    // Verify Table 1 is now available and Table 2 is occupied
    const table1After = await prisma.table.findUnique({ where: { id: table1.id } });
    const table2After = await prisma.table.findUnique({ where: { id: table2.id } });
    assert.equal(table1After.status, 'available');
    assert.equal(table2After.status, 'occupied');

    // 7. TEST OPERATIONAL EXCEPTION: Remove Item from KOT
    const kotItemToRemove = transferredOrder.kots[0]?.items?.find(i => i.menuItemId === menuItem2.id);
    assert.ok(kotItemToRemove, 'KOT Item to remove missing');

    const removeItemResp = await app.inject({
        method: 'POST',
        url: `/api/restaurant/orders/${order1.id}/items/remove`,
        headers: authHeader,
        payload: { kotItemId: kotItemToRemove.id, reason: 'Customer changed mind' },
    });
    assert.equal(removeItemResp.statusCode, 200, 'Remove item failed');
    assert.equal(removeItemResp.json().data.status, 'removed');

    // Verify subtotal updated to 400 (was 500 minus 100)
    const order1Updated = await prisma.order.findUnique({ where: { id: order1.id } });
    assert.equal(Number(order1Updated.subtotal), 400);

    // 8. TEST OPERATIONAL EXCEPTION: Table Reopen
    const reopenResp = await app.inject({
        method: 'POST',
        url: `/api/restaurant/tables/${table1.id}/reopen`,
        headers: authHeader,
    });
    assert.equal(reopenResp.statusCode, 200, 'Reopen table failed');
    assert.equal(reopenResp.json().data.status, 'occupied');

    // 9. TEST CUSTOMER PROFILE
    const customerProfileResp = await app.inject({
        method: 'GET',
        url: `/api/restaurant/customers/${customer.id}/profile`,
        headers: authHeader,
    });
    assert.equal(customerProfileResp.statusCode, 200, 'Customer profile failed');
    const profileData = customerProfileResp.json().data;
    assert.equal(profileData.name, 'Bob Smith');
    assert.ok(profileData.orders.length > 0);

    console.log('✅ Phase 1 Core Order Engine & Table/Customer State Machine tests passed 100% cleanly!');
});
