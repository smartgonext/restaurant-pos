import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
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
        // ignore
    }
});

after(async () => {
    try {
        if (created.restaurantId) {
            await prisma.menuItem.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
            await prisma.itemCategory.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
            await prisma.menu.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
            await prisma.restaurantSettings.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
            await prisma.restaurant.deleteMany({ where: { id: created.restaurantId } }).catch(() => {});
        }
    } finally {
        await app.close();
        await prisma.$disconnect();
    }
});

test('Non-KOT Items — Create and Retrieve', { timeout: 60_000 }, async () => {
    const unique = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    // 1. Create Restaurant
    const restaurant = await prisma.restaurant.create({
        data: {
            name: `Test Non-KOT Restaurant ${unique}`,
            slug: `test-nonkot-${unique}`,
            email: `test-nonkot-${unique}@example.com`,
            businessType: 'restaurant',
            status: 'active',
            enabledModules: '[]',
        },
    });
    created.restaurantId = restaurant.id;

    // 2. JWT token
    const jwtSecret = process.env.JWT_SECRET || 'fallback-secret-change-me';
    const testJWT = jwt.sign(
        { restaurantId: restaurant.id, userId: 999, email: 'test@test.com' },
        jwtSecret,
        { expiresIn: '24h' }
    );
    const authHeader = { authorization: `Bearer ${testJWT}` };

    // 3. Create Menu & Non-KOT Category
    const menu = await prisma.menu.create({
        data: { restaurantId: restaurant.id, name: 'Test Menu', sortOrder: 1 },
    });
    created.menuId = menu.id;

    const nonKotCategory = await prisma.itemCategory.create({
        data: {
            restaurantId: restaurant.id,
            name: 'Test Stock (Non-KOT)',
            isKOTEnabled: false,
            sortOrder: 1,
        },
    });
    created.categoryId = nonKotCategory.id;

    // 4. Create Non-KOT Item via API
    const itemName = `Test Stock Item ${unique}`;
    const createResp = await app.inject({
        method: 'POST',
        url: '/api/restaurant/menu-items',
        headers: authHeader,
        payload: {
            name: itemName,
            description: 'A test stocked item (non-KOT)',
            price: 99.99,
            menuId: menu.id,
            categoryId: nonKotCategory.id,
            isVeg: true,
            isAvailable: true,
            taxType: 'external',
            taxPercent: 5,
        },
    });
    assert.equal(createResp.statusCode, 200, 'Create non-KOT item failed');
    const createdItem = createResp.json().data;
    assert.equal(createdItem.name, itemName);

    // 5. Get all items
    const allResp = await app.inject({
        method: 'GET',
        url: '/api/restaurant/menu-items',
        headers: authHeader,
    });
    assert.equal(allResp.statusCode, 200, 'Get all menu items failed');
    const allItems = allResp.json().data;
    const foundInAll = allItems.find((i) => i.id === createdItem.id);
    assert.ok(foundInAll, 'Item missing from all items list');

    // 6. Get non-KOT items specifically
    const nonKotResp = await app.inject({
        method: 'GET',
        url: '/api/restaurant/menu-items?isKOT=false',
        headers: authHeader,
    });
    assert.equal(nonKotResp.statusCode, 200, 'Get non-KOT items failed');
    const nonKotItems = nonKotResp.json().data;
    const foundInNonKot = nonKotItems.find((i) => i.id === createdItem.id);
    assert.ok(foundInNonKot, 'Item missing from non-KOT filtered items list');
    assert.equal(foundInNonKot.category?.isKOTEnabled, false, 'Category isKOTEnabled should be false');

    console.log('✅ Non-KOT items create & retrieve test passed!');
});
