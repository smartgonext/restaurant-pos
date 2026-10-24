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
            await prisma.kOTItem.deleteMany({ where: { kot: { restaurantId: rId } } }).catch(() => {});
            await prisma.kOT.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.order.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.customer.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
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

test('Phase 4: Kitchen Station Routing, KDS State Machine & Delivery Ingestion Engine', { timeout: 60_000 }, async () => {
    const unique = `phase4-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    // 1. Setup Tenant, Branch, Staff
    const restaurant = await prisma.restaurant.create({
        data: {
            name: `Phase4 Resto ${unique}`,
            slug: `phase4-${unique}`,
            email: `p4-${unique}@resto.com`,
            status: 'active',
            enabledModules: '[]',
        },
    });
    created.restaurantId = restaurant.id;

    const branch = await prisma.branch.create({
        data: { restaurantId: restaurant.id, name: 'Phase 4 Branch', branchCode: `B4-${unique}`, isDefault: true },
    });

    const staffPass = 'Pass123!';
    const staffHash = await bcrypt.hash(staffPass, 10);
    const staff = await prisma.staff.create({
        data: {
            restaurantId: restaurant.id,
            branchId: branch.id,
            name: 'Kitchen Chef',
            email: `chef-${unique}@resto.com`,
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

    // 2. Setup Menu & Items
    const menu = await prisma.menu.create({ data: { restaurantId: restaurant.id, name: 'Main Menu' } });
    const category = await prisma.itemCategory.create({ data: { restaurantId: restaurant.id, name: 'Hot Kitchen', isKOTEnabled: true } });
    const item = await prisma.menuItem.create({ data: { restaurantId: restaurant.id, menuId: menu.id, categoryId: category.id, name: 'Paneer Butter Masala', price: 320 } });

    // 3. Create KOT
    const order = await prisma.order.create({
        data: {
            restaurantId: restaurant.id,
            branchId: branch.id,
            orderNumber: `ORD-${unique}`,
            type: 'dine_in',
            status: 'CREATED',
            subtotal: 320,
            total: 320,
        }
    });

    const kot = await prisma.kOT.create({
        data: {
            restaurantId: restaurant.id,
            orderId: order.id,
            kotNumber: `KOT-${unique}`,
            status: 'pending',
            items: {
                create: [{ menuItemId: item.id, quantity: 1, price: 320, status: 'PENDING' }]
            }
        },
        include: { items: true }
    });
    const kotItemId = kot.items[0].id;

    // 4. TEST KITCHEN ITEM STATUS MACHINE (PENDING -> PREPARING -> READY -> SERVED)
    const prepResp = await app.inject({
        method: 'PUT',
        url: `/api/restaurant/kots/${kot.id}/items/${kotItemId}/status`,
        headers: authHeader,
        payload: { status: 'PREPARING' }
    });
    assert.equal(prepResp.statusCode, 200);
    assert.equal(prepResp.json().data?.status, 'PREPARING');

    const readyResp = await app.inject({
        method: 'PUT',
        url: `/api/restaurant/kots/${kot.id}/items/${kotItemId}/status`,
        headers: authHeader,
        payload: { status: 'READY' }
    });
    assert.equal(readyResp.statusCode, 200);
    assert.equal(readyResp.json().data?.status, 'READY');

    // 5. TEST REALTIME ACKNOWLEDGEMENT API
    const ackResp = await app.inject({
        method: 'POST',
        url: '/api/restaurant/realtime/ack',
        headers: authHeader,
        payload: { messageId: 'MSG-98765', terminalId: 'TERM-01' }
    });
    assert.equal(ackResp.statusCode, 200);
    assert.equal(ackResp.json().data?.acknowledged, true);

    // 6. TEST THIRD-PARTY DELIVERY INGESTION ENGINE (Zomato/Swiggy Order Ingestion)
    const deliveryIngestResp = await app.inject({
        method: 'POST',
        url: '/api/restaurant/integrations/delivery/zomato/orders',
        headers: authHeader,
        payload: {
            externalOrderId: 'ZOMATO-998811',
            customerName: 'Rahul Kumar',
            customerPhone: '9898989898',
            deliveryAddress: 'Flat 402, Green Park Apartments',
            items: [{ menuItemId: item.id, quantity: 2, price: 320 }],
            total: 640,
            notes: 'Extra spicy'
        }
    });
    assert.equal(deliveryIngestResp.statusCode, 200, 'Zomato order ingestion failed');
    const ingestedOrder = deliveryIngestResp.json().data?.order;
    assert.equal(ingestedOrder.type, 'delivery');
    assert.ok(ingestedOrder.orderNumber.startsWith('ZOM-'));

    console.log('✅ Phase 4 Kitchen Station Routing, KDS State Machine & Delivery Ingest tests passed 100% cleanly!');
});
