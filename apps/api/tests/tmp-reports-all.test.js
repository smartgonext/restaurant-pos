import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { buildApp, prisma } from '../src/app.js';
let app;
let staffToken = '';
let restaurantId = 0;
before(async () => {
    app = await buildApp();
    const unique = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const staffPassword = 'Pass@1234';
    const staffHash = await bcrypt.hash(staffPassword, 10);
    const staffEmail = `reports-${unique}@example.com`;
    const restaurant = await prisma.restaurant.create({
        data: {
            name: `Reports Test ${unique}`,
            slug: `reports-test-${unique}`,
            email: `resto-${unique}@example.com`,
            status: 'active',
            enabledModules: '[]',
        },
    });
    restaurantId = restaurant.id;
    const branch = await prisma.branch.create({
        data: {
            restaurantId,
            name: 'Main Branch',
            branchCode: `BR-${unique}`,
            isDefault: true,
            isActive: true,
        },
    });
    const customer = await prisma.customer.create({
        data: {
            restaurantId,
            name: 'Report Customer',
            phone: `9000${Math.floor(Math.random() * 1000000)}`,
        },
    });
    await prisma.staff.create({
        data: {
            restaurantId,
            branchId: branch.id,
            name: 'Report Admin',
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
    assert.equal(loginResp.statusCode, 200, `login failed: ${loginResp.body}`);
    const loginJson = loginResp.json();
    assert.equal(loginJson.success, true);
    staffToken = loginJson.data?.token;
    assert.ok(staffToken, 'staff token missing');
    const menu = await prisma.menu.create({
        data: {
            restaurantId,
            name: 'Test Menu',
            sortOrder: 1,
            isActive: true,
        },
    });
    const nonKotCategory = await prisma.itemCategory.create({
        data: {
            restaurantId,
            name: 'Retail Snacks',
            isKOTEnabled: false,
            sortOrder: 1,
        },
    });
    const menuItem = await prisma.menuItem.create({
        data: {
            restaurantId,
            menuId: menu.id,
            categoryId: nonKotCategory.id,
            name: 'Pack Biscuit',
            price: 100,
            taxType: 'external',
            taxPercent: 5,
            isAvailable: true,
            isVeg: true,
            showOnCustomerSite: true,
        },
    });
    const paidToken = await prisma.bakeryToken.create({
        data: {
            restaurantId,
            branchId: branch.id,
            tokenNumber: 1,
            qrCode: `QR-${unique}-1`,
            status: 'paid',
            customerId: customer.id,
            customerName: customer.name,
            subtotal: 100,
            sgst: 2.5,
            cgst: 2.5,
            total: 105,
            paidAt: new Date(),
        },
    });
    await prisma.bakeryTokenItem.create({
        data: {
            tokenId: paidToken.id,
            menuItemId: menuItem.id,
            menuItemName: menuItem.name,
            price: 100,
            taxRate: 5,
            quantity: 1,
            total: 100,
            addedBy: 'test-suite',
            isRemoved: false,
        },
    });
    await prisma.bakeryTokenItem.create({
        data: {
            tokenId: paidToken.id,
            menuItemId: menuItem.id,
            menuItemName: `${menuItem.name} Removed`,
            price: 50,
            taxRate: 5,
            quantity: 1,
            total: 50,
            addedBy: 'test-suite',
            isRemoved: true,
            removedAt: new Date(),
            removedBy: 'tester',
            removeReason: 'test removal',
        },
    });
    await prisma.bakeryTokenPayment.create({
        data: {
            tokenId: paidToken.id,
            method: 'cash',
            amount: 105,
            paidAt: new Date(),
        },
    });
    const deliveryOrder = await prisma.order.create({
        data: {
            restaurantId,
            branchId: branch.id,
            customerId: customer.id,
            orderNumber: `ORD-${unique}-1`,
            type: 'delivery',
            status: 'paid',
            subtotal: 200,
            sgst: 5,
            cgst: 5,
            total: 210,
            createdAt: new Date(),
        },
    });
    await prisma.orderPayment.create({
        data: {
            orderId: deliveryOrder.id,
            amount: 210,
            method: 'upi',
            paidAt: new Date(),
            isDue: false,
        },
    });
    await prisma.order.create({
        data: {
            restaurantId,
            branchId: branch.id,
            customerId: customer.id,
            orderNumber: `ORD-${unique}-2`,
            type: 'dine_in',
            status: 'cancelled',
            subtotal: 80,
            total: 80,
            createdAt: new Date(),
        },
    });
    const dueOrder = await prisma.order.create({
        data: {
            restaurantId,
            branchId: branch.id,
            customerId: customer.id,
            orderNumber: `ORD-${unique}-3`,
            type: 'dine_in',
            status: 'placed',
            subtotal: 60,
            total: 60,
            createdAt: new Date(),
        },
    });
    await prisma.orderPayment.create({
        data: {
            orderId: dueOrder.id,
            amount: 60,
            method: 'cash',
            isDue: true,
            paidAt: new Date(),
        },
    });
    const refundOrder = await prisma.order.create({
        data: {
            restaurantId,
            branchId: branch.id,
            customerId: customer.id,
            orderNumber: `ORD-${unique}-4`,
            type: 'delivery',
            status: 'paid',
            subtotal: 120,
            total: 120,
            createdAt: new Date(),
        },
    });
    const refundPayment = await prisma.orderPayment.create({
        data: {
            orderId: refundOrder.id,
            amount: 120,
            method: 'card',
            paidAt: new Date(),
        },
    });
    await prisma.refund.create({
        data: {
            orderId: refundOrder.id,
            paymentId: refundPayment.id,
            refundType: 'partial',
            reason: 'test refund',
            originalAmount: 120,
            refundedAmount: 20,
        },
    });
    const expenseCategory = await prisma.expenseCategory.create({
        data: {
            restaurantId,
            name: 'Utilities',
        },
    });
    await prisma.expense.create({
        data: {
            restaurantId,
            categoryId: expenseCategory.id,
            title: 'Power Bill',
            amount: 1500,
            expenseDate: new Date(),
            paymentStatus: 'paid',
            paymentMethod: 'bank',
        },
    });
    const loyaltyProgram = await prisma.loyaltyProgram.create({
        data: {
            restaurantId,
            isActive: true,
            pointsPerAmount: 1,
            amountPerPoint: 0.01,
            pointsPerRupee: 0.1,
            pointValue: 0.5,
            minClaimPoints: 10,
            maxClaimPercent: 10,
        },
    });
    await prisma.loyaltyTransaction.create({
        data: {
            restaurantId,
            customerId: customer.id,
            loyaltyProgramId: loyaltyProgram.id,
            type: 'earn',
            points: 12,
            note: 'test loyalty points',
        },
    });
});
after(async () => {
    await app.close();
    await prisma.$disconnect();
});
test('all report APIs return success and non-zero seeded values', { timeout: 30_000 }, async () => {
    const headers = { authorization: `Bearer ${staffToken}` };
    const endpoints = [
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
    const results = {};
    for (const url of endpoints) {
        const resp = await app.inject({ method: 'GET', url, headers });
        assert.equal(resp.statusCode, 200, `${url} failed: ${resp.body}`);
        const json = resp.json();
        assert.equal(json.success, true, `${url} success=false: ${resp.body}`);
        results[url] = json.data;
    }
    assert.ok(Number(results['/api/restaurant/reports/sales']?.summary?.totalSales || 0) > 0, 'sales summary totalSales should be > 0');
    assert.ok(Number(results['/api/restaurant/reports/tax']?.summary?.totalTax || 0) > 0, 'tax summary totalTax should be > 0');
    assert.ok((results['/api/restaurant/reports/tax']?.itemBreakdown || []).length > 0, 'tax itemBreakdown should contain non-KOT item rows');
    assert.ok((results['/api/restaurant/reports/items'] || []).length > 0, 'item report should not be empty');
    assert.ok((results['/api/restaurant/reports/categories'] || []).length > 0, 'category report should not be empty');
    assert.ok(Number(results['/api/restaurant/reports/expenses']?.summary?.totalExpenses || 0) > 0, 'expense total should be > 0');
    assert.ok(Number(results['/api/restaurant/reports/delivery-apps']?.summary?.totalOrders || 0) > 0, 'delivery app orders should be > 0');
    assert.ok(Number(results['/api/restaurant/reports/cancelled-orders']?.summary?.totalCancelled || 0) > 0, 'cancelled orders should be > 0');
    assert.ok(Number(results['/api/restaurant/reports/removed-kot-items']?.summary?.totalRemoved || 0) > 0, 'removed KOT report should be > 0');
    assert.ok(Number(results['/api/restaurant/reports/refunds']?.summary?.count || 0) > 0, 'refund count should be > 0');
    assert.ok(Number(results['/api/restaurant/reports/loyalty']?.summary?.txCount || 0) > 0, 'loyalty tx count should be > 0');
    assert.ok(Number(results['/api/restaurant/reports/due-payments']?.summary?.pending || 0) > 0, 'due payments pending should be > 0');
});
