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
            await prisma.staff.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.branch.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.restaurant.deleteMany({ where: { id: rId } }).catch(() => {});
        }
    } finally {
        await app.close();
        await prisma.$disconnect();
    }
});

test('Phase 5: Multi-Tenant Guards, Audit Logging & Reporting Bus', { timeout: 60_000 }, async () => {
    const unique = `phase5-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    // 1. Setup Tenant, Branch, Staff
    const restaurant = await prisma.restaurant.create({
        data: {
            name: `Phase5 Resto ${unique}`,
            slug: `phase5-${unique}`,
            email: `p5-${unique}@resto.com`,
            status: 'active',
            enabledModules: JSON.stringify(['inventory', 'cash_register', 'kitchens', 'loyalty', 'reports']),
        },
    });
    created.restaurantId = restaurant.id;

    const branch = await prisma.branch.create({
        data: { restaurantId: restaurant.id, name: 'Phase 5 Branch', branchCode: `B5-${unique}`, isDefault: true },
    });

    const staffPass = 'Pass123!';
    const staffHash = await bcrypt.hash(staffPass, 10);
    const staff = await prisma.staff.create({
        data: {
            restaurantId: restaurant.id,
            branchId: branch.id,
            name: 'Security Admin',
            email: `admin-${unique}@resto.com`,
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

    // 2. TEST SUBSCRIPTION GUARD CHECK
    const guardResp = await app.inject({
        method: 'GET',
        url: '/api/restaurant/subscription/guards',
        headers: authHeader,
    });
    assert.equal(guardResp.statusCode, 200);
    const guardData = guardResp.json().data;
    assert.equal(guardData.restaurantId, restaurant.id);
    assert.ok(guardData.enabledModules.includes('inventory'));

    // 3. TEST CROSS-CUTTING AUDIT LOGGING
    const createAuditResp = await app.inject({
        method: 'POST',
        url: '/api/restaurant/audit-logs',
        headers: authHeader,
        payload: {
            branchId: branch.id,
            action: 'ORDER_DELETED',
            reason: 'Manager authorized order deletion due to keying error',
            referenceId: 'ORD-999',
        }
    });
    assert.equal(createAuditResp.statusCode, 200, 'Audit log creation failed');
    const createdLog = createAuditResp.json().data;
    assert.equal(createdLog.action, 'ORDER_DELETED');

    const getAuditResp = await app.inject({
        method: 'GET',
        url: '/api/restaurant/audit-logs?action=ORDER_DELETED',
        headers: authHeader,
    });
    assert.equal(getAuditResp.statusCode, 200);
    assert.ok(Array.isArray(getAuditResp.json().data));

    // 4. TEST REPORTING BUS HEALTH
    const busHealthResp = await app.inject({
        method: 'GET',
        url: '/api/restaurant/reporting-bus/health',
        headers: authHeader,
    });
    assert.equal(busHealthResp.statusCode, 200);
    assert.equal(busHealthResp.json().data?.status, 'healthy');

    console.log('✅ Phase 5 Multi-Tenant Security, RBAC Audit & Reporting Bus tests passed 100% cleanly!');
});
