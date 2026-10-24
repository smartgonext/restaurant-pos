import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { buildApp, prisma } from '../src/app.js';
import { setupSocketIO } from '../src/plugins/socket.js';
let app;
const created = {};
before(async () => {
    app = await buildApp();
    // Provide a lightweight fake Socket.IO server so route emits do not throw during tests
    try {
        const fakeIo = {
            on: (_, __) => { },
            to: (_room) => ({ emit: (_event, _data) => { } }),
        };
        setupSocketIO(fakeIo);
    }
    catch (e) {
        // ignore
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
    catch (err) {
        console.error('Cleanup error:', err?.message || err);
    }
    finally {
        await app.close();
        await prisma.$disconnect();
    }
});
test('E2E: Customer loyalty earn and redeem', { timeout: 120_000 }, async () => {
    const unique = process.env.E2E_UNIQUE || `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    console.log('E2E loyalty test starting', unique);
    // --- Fixtures ---
    const restaurant = await prisma.restaurant.create({
        data: {
            name: `Loyalty Test ${unique}`,
            slug: `loyalty-${unique}`,
            email: `loyalty-${unique}@example.com`,
            status: 'active',
            enabledModules: '[]',
        },
    });
    created.restaurantId = restaurant.id;
    const branch = await prisma.branch.create({ data: { restaurantId: restaurant.id, name: 'Main Branch', branchCode: `BR-${unique}`, isDefault: true, isActive: true } });
    const category = await prisma.itemCategory.create({ data: { restaurantId: restaurant.id, name: 'Loyalty Cat', sortOrder: 1 } });
    const menu = await prisma.menu.create({ data: { restaurantId: restaurant.id, name: 'Loyalty Menu' } });
    // Best-effort: some developer DBs may be missing newer columns — try to add the column if absent
    try {
        await prisma.$executeRawUnsafe('ALTER TABLE MenuItem ADD COLUMN stockWarningThreshold INT NULL;');
    }
    catch (err) {
        // ignore failures (column exists or permission issues)
    }
    const menuItem = await prisma.menuItem.create({ data: { restaurantId: restaurant.id, menuId: menu.id, categoryId: category.id, name: 'Loyalty Item', price: '100', isAvailable: true } });
    // create staff and login
    const staffPassword = 'Pass@1234';
    const staffHash = await bcrypt.hash(staffPassword, 10);
    const staffEmail = `e2e-loyalty-staff-${unique}@example.com`;
    await prisma.staff.create({ data: { restaurantId: restaurant.id, branchId: branch.id, name: 'E2E Loyalty Staff', email: staffEmail, password: staffHash, role: 'restaurant_admin', isActive: true } });
    const loginResp = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: staffEmail, password: staffPassword } });
    assert.equal(loginResp.statusCode, 200, 'Staff login failed');
    const staffToken = loginResp.json().data?.token;
    assert.ok(staffToken, 'Staff token missing');
    // create main POS via API and login
    const mainTerminalCode = `MAIN-${unique}`;
    const createMain = await app.inject({ method: 'POST', url: '/api/restaurant/pos-terminals/mainpos', headers: { authorization: `Bearer ${staffToken}` }, payload: { name: 'E2E Main POS', terminalCode: mainTerminalCode, pin: '1234', branchId: branch.id } });
    assert.equal(createMain.statusCode, 200, 'Create mainpos failed');
    const mainLoginResp = await app.inject({ method: 'POST', url: '/api/mainpos/login', payload: { terminalCode: mainTerminalCode, pin: '1234' } });
    assert.equal(mainLoginResp.statusCode, 200, 'Main POS login failed');
    const mainposToken = mainLoginResp.json().data?.token;
    assert.ok(mainposToken, 'Main POS token missing');
    // enable loyalty program
    await prisma.loyaltyProgram.create({ data: { restaurantId: restaurant.id, pointsPerRupee: '0.1', pointValue: '0.5', minClaimPoints: 1, maxClaimPercent: '100', isActive: true } });
    // create token with customer and pay
    const customerPhone = `999${String(Math.floor(Math.random() * 9000000) + 1000000)}`;
    const createTokenResp = await app.inject({ method: 'POST', url: '/api/mainpos/token/create', headers: { authorization: `Bearer ${mainposToken}` }, payload: { items: [{ menuItemId: menuItem.id, quantity: 1 }], customerName: 'Alice', customerPhone } });
    assert.equal(createTokenResp.statusCode, 200, 'Token create failed');
    const token = createTokenResp.json().data;
    assert.ok(token && token.qrCode, 'Token QR code missing');
    const paymentResp = await app.inject({ method: 'POST', url: `/api/mainpos/token/${token.qrCode}/payment`, headers: { authorization: `Bearer ${mainposToken}` }, payload: { method: 'cash', amount: Number(token.total || token.subtotal || 0) } });
    assert.equal(paymentResp.statusCode, 200, 'Payment failed');
    const paymentJson = paymentResp.json().data;
    const pointsEarned = Number(paymentJson?.pointsEarned ?? 0);
    assert(pointsEarned > 0, 'Expected points to be earned on payment');
    // verify customer points in DB
    const customer = await prisma.customer.findFirst({ where: { restaurantId: restaurant.id, phone: customerPhone } });
    assert.ok(customer, 'Customer not found in DB');
    assert(customer.loyaltyPoints >= pointsEarned, 'Customer loyalty points not updated correctly');
    // create a second token for same customer to test redeem
    const createToken2Resp = await app.inject({ method: 'POST', url: '/api/mainpos/token/create', headers: { authorization: `Bearer ${mainposToken}` }, payload: { items: [{ menuItemId: menuItem.id, quantity: 1 }], customerName: customer.name, customerPhone } });
    assert.equal(createToken2Resp.statusCode, 200, 'Second token create failed');
    const token2 = createToken2Resp.json().data;
    assert.ok(token2 && token2.qrCode, 'Second token QR missing');
    // claim 1 point (if customer has at least 1)
    const pointsBefore = Number(customer.loyaltyPoints || 0);
    if (pointsBefore >= 1) {
        const claimResp = await app.inject({ method: 'POST', url: `/api/mainpos/token/${token2.qrCode}/loyalty/claim`, headers: { authorization: `Bearer ${mainposToken}` }, payload: { customerId: customer.id, pointsToClaim: 1 } });
        assert.equal(claimResp.statusCode, 200, 'Loyalty claim failed');
        const claimJson = claimResp.json().data;
        assert.ok(claimJson, 'Claim response missing data');
        assert(claimJson.loyaltyPointsClaimed === 1 || Number(claimJson.discountApplied || 0) > 0, 'Claim not applied to token');
        const customerAfter = await prisma.customer.findUnique({ where: { id: customer.id } });
        assert.equal(Number(customerAfter?.loyaltyPoints || 0), pointsBefore - 1, 'Customer loyalty points did not decrement after redeem');
    }
    else {
        throw new Error('Insufficient points to test redeem flow');
    }
    // verify loyalty transactions recorded
    const earnedTx = await prisma.loyaltyTransaction.findFirst({ where: { restaurantId: restaurant.id, type: 'earned' } });
    const redeemedTx = await prisma.loyaltyTransaction.findFirst({ where: { restaurantId: restaurant.id, type: 'redeemed' } });
    assert.ok(earnedTx, 'No earned loyalty transaction found');
    assert.ok(redeemedTx, 'No redeemed loyalty transaction found');
    console.log('✅ Loyalty earn and redeem flow validated');
});
