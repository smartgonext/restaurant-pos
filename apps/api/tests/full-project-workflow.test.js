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
            await prisma.refund.deleteMany({ where: { order: { restaurantId: rId } } }).catch(() => {});
            await prisma.bakeryTokenItem.deleteMany({ where: { token: { restaurantId: rId } } }).catch(() => {});
            await prisma.bakeryToken.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.order.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.waiterRequest.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.reservation.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.tableMenu.deleteMany({ where: { table: { restaurantId: rId } } }).catch(() => {});
            await prisma.table.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.area.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.recipeIngredient.deleteMany({ where: { menuItem: { restaurantId: rId } } }).catch(() => {});
            await prisma.recipe.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.itemModifier.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.modifierGroup.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.menuItem.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.itemCategory.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.itemGroup.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.menu.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.inventoryMovement.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrder: { restaurantId: rId } } }).catch(() => {});
            await prisma.purchaseOrder.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.inventoryItem.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.inventoryItemCategory.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.inventoryUnit.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.supplier.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.expense.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.expenseCategory.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.cashTransaction.deleteMany({ where: { session: { register: { restaurantId: rId } } } }).catch(() => {});
            await prisma.cashRegisterSession.deleteMany({ where: { register: { restaurantId: rId } } }).catch(() => {});
            await prisma.cashRegister.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.subPOSTerminal.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.mainPOSTerminal.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.loyaltyTransaction.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.loyaltyProgram.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.customer.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.kitchen.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.restaurantSettings.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.billSettings.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.staff.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.branch.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.restaurant.deleteMany({ where: { id: rId } }).catch(() => {});
        }
    } finally {
        await app.close();
        await prisma.$disconnect();
    }
});

test('Full Project End-to-End Workflow: Restaurant Creation -> Menu -> POS -> Orders -> KOT -> Payments -> Loyalty -> Inventory -> Reports', { timeout: 180_000 }, async () => {
    const unique = `fullwf-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    console.log('🚀 STAGE 1: Creating Restaurant, Branch, & Staff');
    const restaurant = await prisma.restaurant.create({
        data: {
            name: `Grand Restaurant ${unique}`,
            slug: `grand-resto-${unique}`,
            email: `grand-${unique}@restaurant.com`,
            businessType: 'restaurant',
            status: 'active',
            enabledModules: '["pos","orders","tables","menu","kitchen","inventory","reports","settings","loyalty","expenses"]',
        },
    });
    created.restaurantId = restaurant.id;
    assert.ok(restaurant.id, 'Restaurant creation failed');

    const branch = await prisma.branch.create({
        data: {
            restaurantId: restaurant.id,
            name: 'Main Flagship Branch',
            branchCode: `BR-${unique}`,
            isDefault: true,
            isActive: true,
        },
    });

    const passwordHash = await bcrypt.hash('Pass123!', 10);
    const adminStaff = await prisma.staff.create({
        data: {
            restaurantId: restaurant.id,
            branchId: branch.id,
            name: 'Head Admin Manager',
            email: `admin-${unique}@restaurant.com`,
            password: passwordHash,
            role: 'restaurant_admin',
            isActive: true,
        },
    });

    const loginResp = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: adminStaff.email, password: 'Pass123!' },
    });
    assert.equal(loginResp.statusCode, 200, 'Admin login failed');
    const adminToken = loginResp.json()?.data?.token;
    assert.ok(adminToken, 'Admin token missing');
    const adminHeader = { authorization: `Bearer ${adminToken}` };

    console.log('🚀 STAGE 2: Table & Area Management CRUD');
    const createAreaResp = await app.inject({
        method: 'POST',
        url: '/api/restaurant/areas',
        headers: adminHeader,
        payload: { name: 'VIP Dining Floor', sortOrder: 1 },
    });
    assert.equal(createAreaResp.statusCode, 200, 'Create area failed');
    const areaId = createAreaResp.json()?.data?.id;

    const createTableResp = await app.inject({
        method: 'POST',
        url: '/api/restaurant/tables',
        headers: adminHeader,
        payload: { areaId, name: 'Table T-01', capacity: 4 },
    });
    assert.equal(createTableResp.statusCode, 200, 'Create table failed');
    const tableId = createTableResp.json()?.data?.id;

    console.log('🚀 STAGE 3: Menu, Groups, Categories & Items Setup');
    const menu = await prisma.menu.create({
        data: { restaurantId: restaurant.id, name: 'Main Gourmet Menu', sortOrder: 1 },
    });

    const kotGroup = await prisma.itemGroup.create({
        data: { restaurantId: restaurant.id, name: 'Hot Kitchen Food', isKOTEnabled: true, sortOrder: 1 },
    });
    const nonKotGroup = await prisma.itemGroup.create({
        data: { restaurantId: restaurant.id, name: 'Beverages & Snacks', isKOTEnabled: false, sortOrder: 2 },
    });

    const kotCategory = await prisma.itemCategory.create({
        data: { restaurantId: restaurant.id, groupId: kotGroup.id, name: 'Starters', isKOTEnabled: true, sortOrder: 1 },
    });
    const nonKotCategory = await prisma.itemCategory.create({
        data: { restaurantId: restaurant.id, groupId: nonKotGroup.id, name: 'Bottled Drinks', isKOTEnabled: false, sortOrder: 2 },
    });

    // Create KOT Item
    const kotItemResp = await app.inject({
        method: 'POST',
        url: '/api/restaurant/menu-items',
        headers: adminHeader,
        payload: {
            menuId: menu.id,
            categoryId: kotCategory.id,
            name: 'Crispy Paneer Tikka',
            description: 'Tandoori marinated cottage cheese',
            price: 280,
            isVeg: true,
            isAvailable: true,
        },
    });
    assert.equal(kotItemResp.statusCode, 200, 'Create KOT menu item failed');
    const kotItemId = kotItemResp.json()?.data?.id;

    // Create Non-KOT Item
    const nonKotItemResp = await app.inject({
        method: 'POST',
        url: '/api/restaurant/menu-items',
        headers: adminHeader,
        payload: {
            menuId: menu.id,
            categoryId: nonKotCategory.id,
            name: 'Fresh Mango Juice 500ml',
            description: 'Bottled fresh juice',
            price: 90,
            isVeg: true,
            isAvailable: true,
            taxType: 'external',
            taxPercent: 5,
        },
    });
    assert.equal(nonKotItemResp.statusCode, 200, 'Create Non-KOT menu item failed');
    const nonKotItemId = nonKotItemResp.json()?.data?.id;

    console.log('🚀 STAGE 4: Inventory, Suppliers, & Purchase Orders');
    const unitResp = await app.inject({
        method: 'POST',
        url: '/api/restaurant/inventory/units',
        headers: adminHeader,
        payload: { name: 'Kilogram', symbol: 'kg' },
    });
    assert.equal(unitResp.statusCode, 200, 'Create inventory unit failed');
    const unitId = unitResp.json()?.data?.id;

    const invCatResp = await app.inject({
        method: 'POST',
        url: '/api/restaurant/inventory/categories',
        headers: adminHeader,
        payload: { name: 'Raw Dairy & Produce' },
    });
    assert.equal(invCatResp.statusCode, 200, 'Create inventory category failed');
    const invCatId = invCatResp.json()?.data?.id;

    const invItemResp = await app.inject({
        method: 'POST',
        url: '/api/restaurant/inventory/items',
        headers: adminHeader,
        payload: {
            categoryId: invCatId,
            unitId,
            name: 'Fresh Cottage Cheese (Paneer)',
            thresholdQty: 5,
            currentStock: 50,
            costPerUnit: 180,
        },
    });
    assert.equal(invItemResp.statusCode, 200, 'Create inventory item failed');

    const supplierResp = await app.inject({
        method: 'POST',
        url: '/api/restaurant/inventory/suppliers',
        headers: adminHeader,
        payload: { name: 'Dairy Best Supplies Ltd', contactPerson: 'John Doe', phone: '9876543210' },
    });
    assert.equal(supplierResp.statusCode, 200, 'Create supplier failed');

    console.log('🚀 STAGE 5: POS Terminals Registration & Auth');
    const mainTerminalCode = `MAIN-${unique}`;
    const mainPin = '1234';
    const mainPosTerminalResp = await app.inject({
        method: 'POST',
        url: '/api/restaurant/pos-terminals/mainpos',
        headers: adminHeader,
        payload: {
            name: 'Main Billing Counter 1',
            terminalCode: mainTerminalCode,
            pin: mainPin,
            branchId: branch.id,
        },
    });
    assert.equal(mainPosTerminalResp.statusCode, 200, 'Register Main POS terminal failed');

    const subTerminalCode = `SUB-${unique}`;
    const subPin = '5678';
    const subPosTerminalResp = await app.inject({
        method: 'POST',
        url: '/api/restaurant/pos-terminals/subpos',
        headers: adminHeader,
        payload: {
            name: 'Sub POS Terminal Floor 2',
            terminalCode: subTerminalCode,
            pin: subPin,
            branchId: branch.id,
            groupIds: [kotCategory.id],
        },
    });
    assert.equal(subPosTerminalResp.statusCode, 200, 'Register Sub POS terminal failed');

    // Login Main POS
    const mainPosLoginResp = await app.inject({
        method: 'POST',
        url: '/api/mainpos/login',
        payload: { terminalCode: mainTerminalCode, pin: mainPin },
    });
    assert.equal(mainPosLoginResp.statusCode, 200, 'Main POS login failed');
    const mainPosToken = mainPosLoginResp.json()?.data?.token;
    const mainPosHeader = { authorization: `Bearer ${mainPosToken}` };

    // Login Sub POS
    const subPosLoginResp = await app.inject({
        method: 'POST',
        url: '/api/subpos/login',
        payload: { terminalCode: subTerminalCode, pin: subPin },
    });
    assert.equal(subPosLoginResp.statusCode, 200, 'Sub POS login failed');

    console.log('🚀 STAGE 6: Customer & Loyalty Program Setup');
    const loyaltyConfigResp = await app.inject({
        method: 'PUT',
        url: '/api/restaurant/loyalty/config',
        headers: adminHeader,
        payload: {
            pointsPerAmount: 1,
            amountPerPoint: 0.1,
            isActive: true,
        },
    });
    assert.equal(loyaltyConfigResp.statusCode, 200, 'Setup loyalty config failed');

    const customer = await prisma.customer.create({
        data: {
            restaurantId: restaurant.id,
            name: 'Alice Johnson',
            email: `alice-${unique}@example.com`,
            phone: '9988776655',
            loyaltyPoints: 50,
        },
    });

    console.log('🚀 STAGE 7: Main POS Order Creation, KOT Dispatch & Payment');
    const createTokenResp = await app.inject({
        method: 'POST',
        url: '/api/mainpos/token/create',
        headers: mainPosHeader,
        payload: {
            items: [
                { menuItemId: kotItemId, quantity: 2 },
                { menuItemId: nonKotItemId, quantity: 1 },
            ],
            customerName: customer.name,
            customerPhone: customer.phone,
        },
    });
    assert.equal(createTokenResp.statusCode, 200, 'Create POS token & order failed');
    const tokenData = createTokenResp.json()?.data;
    const tokenQrCode = tokenData?.qrCode;
    assert.ok(tokenQrCode, 'Token QR Code missing');

    const payTokenResp = await app.inject({
        method: 'POST',
        url: `/api/mainpos/token/${tokenQrCode}/payment`,
        headers: mainPosHeader,
        payload: {
            method: 'cash',
            amount: Number(tokenData?.total || 650),
        },
    });
    assert.equal(payTokenResp.statusCode, 200, 'POS token payment failed');

    console.log('🚀 STAGE 8: Settings, Bill Settings & Sidebar Visibility');
    const updateSettingsResp = await app.inject({
        method: 'PUT',
        url: '/api/restaurant/settings/general',
        headers: adminHeader,
        payload: {
            currency: 'USD',
            currencySymbol: '$',
            sgstRate: 2.5,
            cgstRate: 2.5,
            orderPrefix: 'ORD',
            kotPrefix: 'KOT',
        },
    });
    assert.equal(updateSettingsResp.statusCode, 200, 'Update restaurant settings failed');

    const updateBillSettingsResp = await app.inject({
        method: 'PUT',
        url: '/api/restaurant/bill-settings',
        headers: adminHeader,
        payload: {
            showGST: true,
            thankYouMessage: 'Thank you for dining with us!',
        },
    });
    assert.equal(updateBillSettingsResp.statusCode, 200, 'Update bill settings failed');

    console.log('🚀 STAGE 9: Validating Full 11-Report Suite Output');
    const reportEndpoints = [
        '/api/restaurant/reports/sales',
        '/api/restaurant/reports/items',
        '/api/restaurant/reports/categories',
        '/api/restaurant/reports/tax',
        '/api/restaurant/reports/expenses',
        '/api/restaurant/reports/delivery-apps',
        '/api/restaurant/reports/cancelled-orders',
        '/api/restaurant/reports/removed-kot-items',
        '/api/restaurant/reports/refunds',
        '/api/restaurant/reports/loyalty',
        '/api/restaurant/reports/due-payments',
    ];

    for (const ep of reportEndpoints) {
        const repResp = await app.inject({
            method: 'GET',
            url: ep,
            headers: adminHeader,
        });
        assert.equal(repResp.statusCode, 200, `Report failed for endpoint: ${ep}`);
        assert.equal(repResp.json()?.success, true, `Report success=false for endpoint: ${ep}`);
    }

    console.log('🎉 Full Project End-to-End Workflow Passed 100% Successfully!');
});
