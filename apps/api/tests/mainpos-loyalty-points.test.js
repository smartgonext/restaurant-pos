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
            on: (_, __) => { },
            to: (_room) => ({ emit: (_event, _data) => { } }),
        };
        setupSocketIO(fakeIo);
    }
    catch {
        // ignore in tests
    }
});
after(async () => {
    try {
        if (created.restaurantId) {
            await prisma.loyaltyTransaction.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => { });
            await prisma.loyaltyProgram.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => { });
            await prisma.bakeryToken.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => { });
            await prisma.order.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => { });
            await prisma.menuItem.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => { });
            await prisma.menu.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => { });
            await prisma.itemCategory.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => { });
            await prisma.customer.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => { });
            await prisma.branch.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => { });
            await prisma.staff.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => { });
            await prisma.mainPOSTerminal.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => { });
            await prisma.restaurantSettings.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => { });
            await prisma.restaurant.deleteMany({ where: { id: created.restaurantId } }).catch(() => { });
        }
    }
    finally {
        await app.close();
        await prisma.$disconnect();
    }
});
test('Main POS payment increases loyalty points after customer attach', { timeout: 120_000 }, async () => {
    const unique = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const restaurant = await prisma.restaurant.create({
        data: {
            name: `MainPOS Loyalty ${unique}`,
            slug: `mainpos-loyalty-${unique}`,
            email: `mainpos-loyalty-${unique}@example.com`,
            status: 'active',
            enabledModules: '[]',
        },
    });
    created.restaurantId = restaurant.id;
    const branch = await prisma.branch.create({
        data: { restaurantId: restaurant.id, name: 'Main Branch', branchCode: `BR-${unique}`, isDefault: true, isActive: true },
    });
    const category = await prisma.itemCategory.create({
        data: { restaurantId: restaurant.id, name: 'Loyalty Cat', sortOrder: 1 },
    });
    const menu = await prisma.menu.create({
        data: { restaurantId: restaurant.id, name: 'Loyalty Menu' },
    });
    const menuItem = await prisma.menuItem.create({
        data: {
            restaurantId: restaurant.id,
            menuId: menu.id,
            categoryId: category.id,
            name: 'Loyalty Item',
            price: '100',
            isAvailable: true,
        },
    });
    const staffPassword = 'Pass@1234';
    const staffHash = await bcrypt.hash(staffPassword, 10);
    const staffEmail = `mainpos-loyalty-staff-${unique}@example.com`;
    await prisma.staff.create({
        data: {
            restaurantId: restaurant.id,
            branchId: branch.id,
            name: 'MainPOS Loyalty Staff',
            email: staffEmail,
            password: staffHash,
            role: 'restaurant_admin',
            isActive: true,
        },
    });
    const authResp = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: staffEmail, password: staffPassword },
    });
    assert.equal(authResp.statusCode, 200, 'Staff login failed');
    const staffToken = authResp.json().data?.token;
    assert.ok(staffToken, 'Staff token missing');
    const terminalCode = `MAIN-${unique}`;
    const createMainResp = await app.inject({
        method: 'POST',
        url: '/api/restaurant/pos-terminals/mainpos',
        headers: { authorization: `Bearer ${staffToken}` },
        payload: {
            name: 'Main POS',
            terminalCode,
            pin: '1234',
            branchId: branch.id,
        },
    });
    assert.equal(createMainResp.statusCode, 200, `Create Main POS failed: ${createMainResp.body}`);
    const mainLoginResp = await app.inject({
        method: 'POST',
        url: '/api/mainpos/login',
        payload: { terminalCode, pin: '1234' },
    });
    assert.equal(mainLoginResp.statusCode, 200, 'Main POS login failed');
    const mainToken = mainLoginResp.json().data?.token;
    assert.ok(mainToken, 'Main POS token missing');
    await prisma.loyaltyProgram.create({
        data: {
            restaurantId: restaurant.id,
            pointsPerRupee: '0.1',
            pointValue: '0.5',
            minClaimPoints: 1,
            maxClaimPercent: '100',
            isActive: true,
        },
    });
    const createTokenResp = await app.inject({
        method: 'POST',
        url: '/api/mainpos/token/create',
        headers: { authorization: `Bearer ${mainToken}` },
        payload: {
            items: [{ menuItemId: menuItem.id, quantity: 1 }],
        },
    });
    assert.equal(createTokenResp.statusCode, 200, `Token create failed: ${createTokenResp.body}`);
    const token = createTokenResp.json().data;
    assert.ok(token?.qrCode, 'Token QR missing');
    const customerPhone = `999${String(Math.floor(Math.random() * 9000000) + 1000000)}`;
    const attachResp = await app.inject({
        method: 'POST',
        url: `/api/mainpos/token/${token.qrCode}/customer`,
        headers: { authorization: `Bearer ${mainToken}` },
        payload: {
            customerName: 'Alice Loyalty',
            customerPhone,
        },
    });
    assert.equal(attachResp.statusCode, 200, `Attach customer failed: ${attachResp.body}`);
    const refreshedResp = await app.inject({
        method: 'GET',
        url: `/api/mainpos/token/${token.qrCode}`,
        headers: { authorization: `Bearer ${mainToken}` },
    });
    assert.equal(refreshedResp.statusCode, 200, 'Token fetch after attach failed');
    const refreshedToken = refreshedResp.json().data;
    const amountToPay = Number(refreshedToken.total || refreshedToken.subtotal || 0);
    assert.ok(amountToPay > 0, 'Invalid amount to pay');
    const paymentResp = await app.inject({
        method: 'POST',
        url: `/api/mainpos/token/${token.qrCode}/payment`,
        headers: { authorization: `Bearer ${mainToken}` },
        payload: { method: 'cash', amount: amountToPay },
    });
    assert.equal(paymentResp.statusCode, 200, `Payment failed: ${paymentResp.body}`);
    const paymentJson = paymentResp.json().data;
    const pointsEarned = Number(paymentJson?.pointsEarned ?? 0);
    assert.ok(pointsEarned > 0, `Expected pointsEarned > 0, got ${pointsEarned}`);
    const customer = await prisma.customer.findFirst({ where: { restaurantId: restaurant.id, phone: customerPhone } });
    assert.ok(customer, 'Customer not found in DB');
    assert.ok(Number(customer.loyaltyPoints || 0) >= pointsEarned, 'Customer points did not increase after payment');
    const earnedTx = await prisma.loyaltyTransaction.findFirst({
        where: {
            restaurantId: restaurant.id,
            customerId: customer.id,
            type: 'earned',
        },
    });
    assert.ok(earnedTx, 'No earned loyalty transaction created for paid token');
});
