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
            on: (_, __) => {},
            to: (_room) => ({ emit: (_event, _data) => {} }),
        };
        setupSocketIO(fakeIo);
    } catch (e) {
        // ignore
    }
});

after(async () => {
    try {
        if (created.restaurantId) {
            await prisma.bakeryTokenItem.deleteMany({ where: { token: { restaurantId: created.restaurantId } } }).catch(() => {});
            await prisma.bakeryTokenPayment.deleteMany({ where: { token: { restaurantId: created.restaurantId } } }).catch(() => {});
            await prisma.bakeryToken.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
            await prisma.kOTItem.deleteMany({ where: { kot: { restaurantId: created.restaurantId } } }).catch(() => {});
            await prisma.kOT.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
            await prisma.orderPayment.deleteMany({ where: { order: { restaurantId: created.restaurantId } } }).catch(() => {});
            await prisma.order.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
            await prisma.menuItem.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
            await prisma.itemCategory.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
            await prisma.itemGroup.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
            await prisma.menu.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
            await prisma.staff.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
            await prisma.mainPOSTerminal.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
            await prisma.branch.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
            await prisma.restaurantSettings.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
            await prisma.restaurant.deleteMany({ where: { id: created.restaurantId } }).catch(() => {});
        }
    } catch (err) {
        console.error('Cleanup error:', err?.message || err);
    } finally {
        await app.close();
        await prisma.$disconnect();
    }
});

test('Dashboard Order Increment Verification Test', { timeout: 60_000 }, async () => {
    const unique = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    // 1. Create Restaurant, Branch, Group, Category, Menu Item
    const restaurant = await prisma.restaurant.create({
        data: {
            name: `Order Inc Test ${unique}`,
            slug: `order-inc-${unique}`,
            email: `order-inc-${unique}@example.com`,
            status: 'active',
            enabledModules: '[]',
        },
    });
    created.restaurantId = restaurant.id;

    const branch = await prisma.branch.create({
        data: {
            restaurantId: restaurant.id,
            name: 'Main Branch',
            branchCode: `BR-${unique}`,
            isDefault: true,
            isActive: true,
        },
    });
    created.branchId = branch.id;

    const staffPassword = 'Pass@1234password';
    const staffHash = await bcrypt.hash(staffPassword, 10);
    const adminStaff = await prisma.staff.create({
        data: {
            restaurantId: restaurant.id,
            branchId: branch.id,
            name: 'Admin Staff',
            email: `admin-${unique}@example.com`,
            password: staffHash,
            role: 'restaurant_admin',
            isActive: true,
        },
    });

    const terminalPin = '1234';
    const terminalPinHash = await bcrypt.hash(terminalPin, 10);
    const terminal = await prisma.mainPOSTerminal.create({
        data: {
            restaurantId: restaurant.id,
            branchId: branch.id,
            terminalCode: `TERM-${unique}`,
            name: 'Main POS 1',
            pin: terminalPinHash,
            isActive: true,
        },
    });

    // Login Staff to get restaurant auth token
    const loginResp = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: adminStaff.email, password: staffPassword }
    });
    assert.equal(loginResp.statusCode, 200);
    const token = loginResp.json().data?.token;
    const authHeader = { authorization: `Bearer ${token}` };

    // Login MainPOS terminal to get MainPOS auth token
    const posLoginResp = await app.inject({
        method: 'POST',
        url: '/api/mainpos/login',
        payload: { terminalCode: terminal.terminalCode, pin: terminalPin }
    });
    assert.equal(posLoginResp.statusCode, 200);
    const posToken = posLoginResp.json().data?.token;
    const posHeader = { authorization: `Bearer ${posToken}` };

    // Create Menu Item
    const menu = await prisma.menu.create({ data: { restaurantId: restaurant.id, name: 'Menu 1' } });
    const group = await prisma.itemGroup.create({ data: { restaurantId: restaurant.id, name: 'Group 1' } });
    const category = await prisma.itemCategory.create({ data: { restaurantId: restaurant.id, groupId: group.id, name: 'Cat 1', isKOTEnabled: true } });
    const menuItem = await prisma.menuItem.create({
        data: { restaurantId: restaurant.id, menuId: menu.id, categoryId: category.id, name: 'Burger', price: 100 }
    });

    // 2. Fetch initial Dashboard stats
    const dash1 = await app.inject({
        method: 'GET',
        url: '/api/restaurant/dashboard',
        headers: authHeader
    });
    assert.equal(dash1.statusCode, 200);
    const initialTodayOrders = dash1.json().data.todayOrders;

    // 3. Create 1 token order via Main POS
    const createTokenResp = await app.inject({
        method: 'POST',
        url: '/api/mainpos/token/create',
        headers: posHeader,
        payload: {
            items: [{ menuItemId: menuItem.id, quantity: 1 }],
            customerName: 'Test Customer',
            customerPhone: '9876543210'
        }
    });
    assert.equal(createTokenResp.statusCode, 200);

    // 4. Fetch updated Dashboard stats
    const dash2 = await app.inject({
        method: 'GET',
        url: '/api/restaurant/dashboard',
        headers: authHeader
    });
    assert.equal(dash2.statusCode, 200);
    const newTodayOrders = dash2.json().data.todayOrders;

    // Verify order count incremented by EXACTLY 1 (not 2)
    assert.equal(newTodayOrders, initialTodayOrders + 1, `Expected order count to increase by 1 (from ${initialTodayOrders} to ${initialTodayOrders + 1}), but got ${newTodayOrders}`);

    console.log(`✅ Order count correctly incremented by 1 (from ${initialTodayOrders} to ${newTodayOrders})!`);
});
