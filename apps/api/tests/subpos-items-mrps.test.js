import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { buildApp, prisma } from '../src/app.js';
let app;
let createdRestaurantId = null;
before(async () => {
    app = await buildApp();
});
after(async () => {
    if (createdRestaurantId) {
        await prisma.restaurant.deleteMany({ where: { id: createdRestaurantId } });
    }
    await app.close();
    await prisma.$disconnect();
});
test('SubPOS items API returns item with multiple active inventory MRPs', { timeout: 20_000 }, async () => {
    const unique = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const restaurant = await prisma.restaurant.create({
        data: {
            name: `Test Restaurant ${unique}`,
            slug: `test-restaurant-${unique}`,
            email: `test-${unique}@example.com`,
            status: 'active',
            enabledModules: '[]',
        },
    });
    createdRestaurantId = restaurant.id;
    const branch = await prisma.branch.create({
        data: {
            restaurantId: restaurant.id,
            name: 'Main Branch',
            branchCode: `BR-${unique}`,
            isDefault: true,
            isActive: true,
        },
    });
    const menu = await prisma.menu.create({
        data: {
            restaurantId: restaurant.id,
            name: 'Test Menu',
        },
    });
    const category = await prisma.itemCategory.create({
        data: {
            restaurantId: restaurant.id,
            name: 'Snacks',
            sortOrder: 1,
        },
    });
    const inventoryCategory = await prisma.inventoryItemCategory.create({
        data: {
            restaurantId: restaurant.id,
            name: 'Ingredients',
        },
    });
    const inventoryUnit = await prisma.inventoryUnit.create({
        data: {
            restaurantId: restaurant.id,
            name: 'Kilogram',
            symbol: 'kg',
        },
    });
    const inventoryItem = await prisma.inventoryItem.create({
        data: {
            restaurantId: restaurant.id,
            categoryId: inventoryCategory.id,
            unitId: inventoryUnit.id,
            name: 'Test Inventory Item',
            thresholdQty: '0',
            currentStock: '100',
            costPerUnit: '50.00',
        },
    });
    await prisma.inventoryItemMRP.createMany({
        data: [
            {
                inventoryItemId: inventoryItem.id,
                mrp: '100.00',
                purchaseRate: '80.00',
                profitPercent: '5.00',
                isActive: true,
            },
            {
                inventoryItemId: inventoryItem.id,
                mrp: '110.00',
                purchaseRate: '90.00',
                profitPercent: '7.00',
                isActive: true,
            },
            {
                inventoryItemId: inventoryItem.id,
                mrp: '120.00',
                purchaseRate: '100.00',
                profitPercent: '10.00',
                isActive: false,
            },
        ],
    });
    const menuItem = await prisma.menuItem.create({
        data: {
            restaurantId: restaurant.id,
            menuId: menu.id,
            categoryId: category.id,
            inventoryItemId: inventoryItem.id,
            name: 'Test Snack',
            price: '120.00',
            taxType: 'external',
            taxPercent: '5.00',
            isAvailable: true,
        },
    });
    const staffPassword = 'Pass@1234';
    const staffHash = await bcrypt.hash(staffPassword, 10);
    const staffEmail = `manager-${unique}@example.com`;
    await prisma.staff.create({
        data: {
            restaurantId: restaurant.id,
            branchId: branch.id,
            name: 'Manager',
            email: staffEmail,
            password: staffHash,
            role: 'restaurant_admin',
            isActive: true,
        },
    });
    const loginResp = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: staffEmail, password: staffPassword },
    });
    assert.equal(loginResp.statusCode, 200, `staff login failed: ${loginResp.body}`);
    const loginJson = loginResp.json();
    assert.equal(loginJson.success, true);
    const staffToken = loginJson.data?.token;
    assert.ok(staffToken, 'staff token missing');
    const subTerminalCode = `SUB-${unique}`;
    const subPin = '5678';
    const createSubResp = await app.inject({
        method: 'POST',
        url: '/api/restaurant/pos-terminals/subpos',
        headers: { authorization: `Bearer ${staffToken}` },
        payload: {
            name: 'Sub POS 1',
            terminalCode: subTerminalCode,
            pin: subPin,
            branchId: branch.id,
            groupIds: [category.id],
        },
    });
    assert.equal(createSubResp.statusCode, 200, `subpos create failed: ${createSubResp.body}`);
    assert.equal(createSubResp.json().success, true);
    const subLoginResp = await app.inject({
        method: 'POST',
        url: '/api/subpos/login',
        payload: { terminalCode: subTerminalCode, pin: subPin },
    });
    assert.equal(subLoginResp.statusCode, 200, `subpos login failed: ${subLoginResp.body}`);
    const subLoginJson = subLoginResp.json();
    assert.equal(subLoginJson.success, true);
    const subposToken = subLoginJson.data?.token;
    assert.ok(subposToken, 'subpos token missing');
    const subItemsResp = await app.inject({
        method: 'GET',
        url: '/api/subpos/items',
        headers: { authorization: `Bearer ${subposToken}` },
    });
    assert.equal(subItemsResp.statusCode, 200, `subpos items fetch failed: ${subItemsResp.body}`);
    const subItemsJson = subItemsResp.json();
    assert.equal(subItemsJson.success, true);
    assert.ok(Array.isArray(subItemsJson.data), 'subpos items response missing data array');
    const returnedItem = subItemsJson.data.find(i => i.id === menuItem.id);
    assert.ok(returnedItem, 'menu item not returned in SubPOS items');
    assert.ok(returnedItem.inventoryItem, 'returned item missing inventoryItem');
    assert.ok(Array.isArray(returnedItem.inventoryItem.inventoryMRPs), 'returned inventoryItem missing inventoryMRPs array');
    assert.equal(returnedItem.inventoryItem.inventoryMRPs.length, 2, 'expected exactly 2 active inventory MRPs');
    const mrpValues = returnedItem.inventoryItem.inventoryMRPs.map((m) => Number(m.mrp));
    assert.deepEqual(mrpValues.sort(), [100, 110]);
});
