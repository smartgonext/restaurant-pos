import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { buildApp, prisma } from '../src/app.js';

let app;
let createdRestaurantId = null;
let createdBranchId = null;
let staffToken = null;

before(async () => {
    app = await buildApp();
});

after(async () => {
    if (createdRestaurantId) {
        await prisma.inventoryUnit.deleteMany({ where: { restaurantId: createdRestaurantId } });
        await prisma.billSettings.deleteMany({ where: { restaurantId: createdRestaurantId } });
        await prisma.loyaltyProgram.deleteMany({ where: { restaurantId: createdRestaurantId } });
        await prisma.restaurantSettings.deleteMany({ where: { restaurantId: createdRestaurantId } });
        await prisma.staff.deleteMany({ where: { restaurantId: createdRestaurantId } });
        await prisma.branch.deleteMany({ where: { restaurantId: createdRestaurantId } });
        await prisma.restaurant.deleteMany({ where: { id: createdRestaurantId } });
    }
    await app.close();
    await prisma.$disconnect();
});

test('Restaurant Settings Comprehensive Suite - All Modules & Performance Impact', { timeout: 30_000 }, async () => {
    const unique = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    // 1. Setup Test Restaurant, Branch, Admin Staff, and Auth Token
    const restaurant = await prisma.restaurant.create({
        data: {
            name: `Settings Test Resto ${unique}`,
            slug: `settings-test-resto-${unique}`,
            email: `settings-${unique}@example.com`,
            status: 'active',
            enabledModules: '[]',
        },
    });
    createdRestaurantId = restaurant.id;

    const branch = await prisma.branch.create({
        data: {
            restaurantId: restaurant.id,
            name: 'Main Branch',
            branchCode: `BR-SET-${unique}`,
            isDefault: true,
            isActive: true,
        },
    });
    createdBranchId = branch.id;

    const staffPassword = 'Pass@12345';
    const staffHash = await bcrypt.hash(staffPassword, 10);
    const staffEmail = `admin-settings-${unique}@example.com`;

    await prisma.staff.create({
        data: {
            restaurantId: restaurant.id,
            branchId: branch.id,
            name: 'Settings Admin',
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
    assert.equal(loginResp.statusCode, 200, `Login failed: ${loginResp.body}`);
    staffToken = loginResp.json().data?.token;
    assert.ok(staffToken, 'Auth token missing');

    const authHeaders = { authorization: `Bearer ${staffToken}` };

    // ── Module 1: General Settings (orderPrefix, kotPrefix, timezone, allowDineIn, etc.) ──
    const generalPayload = {
        orderPrefix: 'MYORD',
        kotPrefix: 'MYKOT',
        timezone: 'Asia/Kolkata',
        allowDineIn: true,
        allowDelivery: false,
        allowPickup: true,
        deliveryFee: 45,
        minOrderAmount: 150,
    };

    const updateGeneralResp = await app.inject({
        method: 'PUT',
        url: '/api/restaurant/settings/general',
        headers: authHeaders,
        payload: generalPayload,
    });
    assert.equal(updateGeneralResp.statusCode, 200, `Update General failed: ${updateGeneralResp.body}`);
    assert.equal(updateGeneralResp.json().success, true);

    const getGeneralResp = await app.inject({
        method: 'GET',
        url: '/api/restaurant/settings',
        headers: authHeaders,
    });
    assert.equal(getGeneralResp.statusCode, 200);
    const generalData = getGeneralResp.json().data;
    assert.equal(generalData.orderPrefix, 'MYORD');
    assert.equal(generalData.kotPrefix, 'MYKOT');
    assert.equal(generalData.timezone, 'Asia/Kolkata');
    assert.equal(generalData.allowDelivery, false);
    assert.equal(Number(generalData.deliveryFee), 45);

    // ── Module 2: Tax Configuration & Calculation Impact ──
    const taxPayload = {
        taxMode: 'exclusive',
        isInterState: true,
        igstRate: 18,
        sgstRate: 9,
        cgstRate: 9,
    };

    const updateTaxResp = await app.inject({
        method: 'PUT',
        url: '/api/restaurant/settings/general',
        headers: authHeaders,
        payload: taxPayload,
    });
    assert.equal(updateTaxResp.statusCode, 200);

    const getTaxResp = await app.inject({
        method: 'GET',
        url: '/api/restaurant/settings',
        headers: authHeaders,
    });
    const taxData = getTaxResp.json().data;
    assert.equal(taxData.taxMode, 'exclusive');
    assert.equal(taxData.isInterState, true);
    assert.equal(Number(taxData.igstRate), 18);

    // ── Module 3: Currency & Formatting Settings ──
    const currencyPayload = {
        currency: 'INR',
        currencySymbol: '₹',
    };

    const updateCurrResp = await app.inject({
        method: 'PUT',
        url: '/api/restaurant/settings/general',
        headers: authHeaders,
        payload: currencyPayload,
    });
    assert.equal(updateCurrResp.statusCode, 200);

    const getCurrResp = await app.inject({
        method: 'GET',
        url: '/api/restaurant/settings',
        headers: authHeaders,
    });
    assert.equal(getCurrResp.json().data.currency, 'INR');
    assert.equal(getCurrResp.json().data.currencySymbol, '₹');

    // ── Module 4: Security Settings (posDeletePassword hashing) ──
    const secPin = '8844';
    const updateSecResp = await app.inject({
        method: 'PUT',
        url: '/api/restaurant/settings/general',
        headers: authHeaders,
        payload: { posDeletePassword: secPin },
    });
    assert.equal(updateSecResp.statusCode, 200);

    const dbSettings = await prisma.restaurantSettings.findUnique({
        where: { restaurantId: createdRestaurantId },
    });
    assert.ok(dbSettings.posDeletePassword, 'posDeletePassword missing in DB');
    const pinMatches = await bcrypt.compare(secPin, dbSettings.posDeletePassword);
    assert.equal(pinMatches, true, 'Hashed POS delete PIN does not match original PIN');

    // ── Module 5: Theme & Appearance Settings ──
    const themeObj = {
        mode: 'dark',
        brandColor: '#2563eb',
        navVisibility: { dashboard: true, pos: true, reports: false },
    };

    const updateThemeResp = await app.inject({
        method: 'PUT',
        url: '/api/restaurant/settings/general',
        headers: authHeaders,
        payload: { theme: themeObj },
    });
    assert.equal(updateThemeResp.statusCode, 200);

    const getThemeResp = await app.inject({
        method: 'GET',
        url: '/api/restaurant/settings',
        headers: authHeaders,
    });
    const parsedTheme = getThemeResp.json().data?.theme;
    assert.ok(parsedTheme, 'Theme data missing in GET response');
    assert.equal(parsedTheme.mode, 'dark');
    assert.equal(parsedTheme.brandColor, '#2563eb');
    assert.equal(parsedTheme.navVisibility?.reports, false);

    // ── Module 6: Operational Shifts & Site Config ──
    const shiftConfigObj = {
        shifts: [
            { id: 'shift-1', name: 'Morning Shift', startTime: '07:00', endTime: '15:00', isActive: true },
            { id: 'shift-2', name: 'Night Shift', startTime: '15:00', endTime: '23:00', isActive: true },
        ],
    };

    const updateShiftsResp = await app.inject({
        method: 'PUT',
        url: '/api/restaurant/settings/general',
        headers: authHeaders,
        payload: { customerSiteConfig: shiftConfigObj },
    });
    assert.equal(updateShiftsResp.statusCode, 200);

    const getShiftsResp = await app.inject({
        method: 'GET',
        url: '/api/restaurant/settings',
        headers: authHeaders,
    });
    const siteConfigStr = getShiftsResp.json().data?.customerSiteConfig;
    assert.ok(siteConfigStr, 'customerSiteConfig missing');
    const siteConfig = typeof siteConfigStr === 'string' ? JSON.parse(siteConfigStr) : siteConfigStr;
    assert.equal(siteConfig.shifts?.length, 2);
    assert.equal(siteConfig.shifts[0].name, 'Morning Shift');

    // ── Module 7: Cancellation Reasons ──
    const cancelReasons = ['Customer Cancelled', 'Item Out of Stock', 'Kitchen Busy'];
    const updateCancelResp = await app.inject({
        method: 'PUT',
        url: '/api/restaurant/settings/general',
        headers: authHeaders,
        payload: { cancellationReasons: cancelReasons },
    });
    assert.equal(updateCancelResp.statusCode, 200);

    const getCancelResp = await app.inject({
        method: 'GET',
        url: '/api/restaurant/settings',
        headers: authHeaders,
    });
    const savedReasons = getCancelResp.json().data?.cancellationReasons;
    assert.ok(savedReasons.includes('Kitchen Busy'), 'Cancellation reasons not saved correctly');

    // ── Module 8: Loyalty Program Configuration & Enforcement Impact ──
    const loyaltyPayload = {
        rupeesPerPoint: 100,
        minClaimPoints: 50,
        maxClaimPercent: 25,
        isActive: true,
    };

    const updateLoyaltyResp = await app.inject({
        method: 'PUT',
        url: '/api/restaurant/loyalty/config',
        headers: authHeaders,
        payload: loyaltyPayload,
    });
    assert.equal(updateLoyaltyResp.statusCode, 200, `Loyalty config failed: ${updateLoyaltyResp.body}`);

    const getLoyaltyResp = await app.inject({
        method: 'GET',
        url: '/api/restaurant/loyalty/config',
        headers: authHeaders,
    });
    assert.equal(getLoyaltyResp.statusCode, 200);
    const loyaltyData = getLoyaltyResp.json().data;
    assert.equal(loyaltyData.minClaimPoints, 50);
    assert.equal(Number(loyaltyData.pointsPerRupee), 0.01);

    // Verify Loyalty Point Claim Minimum Constraint Performance Impact
    const testCustomer = await prisma.customer.create({
        data: {
            restaurantId: createdRestaurantId,
            name: 'Loyalty Tester',
            phone: `9999${Math.floor(Math.random() * 10000)}`,
            loyaltyPoints: 100,
        },
    });

    const failedClaimResp = await app.inject({
        method: 'POST',
        url: `/api/restaurant/loyalty/customers/${testCustomer.id}/claim`,
        headers: authHeaders,
        payload: { points: 20 }, // Less than minClaimPoints (50)
    });
    assert.equal(failedClaimResp.statusCode, 400, 'Claim should fail when under minClaimPoints');
    assert.ok(failedClaimResp.json().error.includes('Minimum 50 points required'), 'Validation error message mismatch');

    // ── Module 9: WhatsApp & Webhook Settings ──
    const waPayload = {
        enabled: true,
        token: 'EAAG123456789TOKEN',
        phoneNumberId: '10987654321',
    };

    const updateWaResp = await app.inject({
        method: 'PUT',
        url: '/api/restaurant/whatsapp/config',
        headers: authHeaders,
        payload: waPayload,
    });
    assert.equal(updateWaResp.statusCode, 200);

    const getWaResp = await app.inject({
        method: 'GET',
        url: '/api/restaurant/whatsapp/config',
        headers: authHeaders,
    });
    assert.equal(getWaResp.json().data.whatsappEnabled, true);
    assert.equal(getWaResp.json().data.whatsappToken, 'EAAG123456789TOKEN');

    const webhookUrls = ['https://test.webhook.site/order-created', 'https://test.webhook.site/stock-update'];
    const updateWebhookResp = await app.inject({
        method: 'PUT',
        url: '/api/restaurant/whatsapp/webhooks',
        headers: authHeaders,
        payload: { urls: webhookUrls },
    });
    assert.equal(updateWebhookResp.statusCode, 200);

    const getWebhookResp = await app.inject({
        method: 'GET',
        url: '/api/restaurant/whatsapp/webhooks',
        headers: authHeaders,
    });
    assert.equal(getWebhookResp.statusCode, 200);
    const savedWebhooks = getWebhookResp.json().data;
    assert.ok(Array.isArray(savedWebhooks) || typeof savedWebhooks === 'string');

    // ── Module 10: Inventory Units Settings ──
    const createUnitResp = await app.inject({
        method: 'POST',
        url: '/api/restaurant/inventory/units',
        headers: authHeaders,
        payload: { name: 'Dozen', symbol: 'dz' },
    });
    assert.equal(createUnitResp.statusCode, 200, `Create unit failed: ${createUnitResp.body}`);
    const createdUnitId = createUnitResp.json().data?.id;
    assert.ok(createdUnitId, 'Created unit ID missing');

    const getUnitsResp = await app.inject({
        method: 'GET',
        url: '/api/restaurant/inventory/units',
        headers: authHeaders,
    });
    assert.equal(getUnitsResp.statusCode, 200);
    const unitsList = getUnitsResp.json().data;
    const foundDozen = unitsList.find((u) => u.id === createdUnitId);
    assert.ok(foundDozen, 'Created unit not found in list');
    assert.equal(foundDozen.symbol, 'dz');

    // ── Module 11: Bill Display Settings ──
    const billPayload = {
        showGST: true,
        showUnitForKOT: true,
        showUnitForNonKOT: true,
        loyaltyDiscountFormat: 'detailed',
        thankYouMessage: 'Visit Us Again Soon!',
        showTokenNumber: true,
        showRestaurantInfo: true,
        showPhoneNumber: true,
    };

    const updateBillResp = await app.inject({
        method: 'PUT',
        url: '/api/restaurant/bill-settings',
        headers: authHeaders,
        payload: billPayload,
    });
    assert.equal(updateBillResp.statusCode, 200, `Update bill settings failed: ${updateBillResp.body}`);

    const getBillResp = await app.inject({
        method: 'GET',
        url: '/api/restaurant/bill-settings',
        headers: authHeaders,
    });
    assert.equal(getBillResp.statusCode, 200);
    const billData = getBillResp.json().data;
    assert.equal(billData.showGST, true);
    assert.equal(billData.thankYouMessage, 'Visit Us Again Soon!');
    assert.equal(billData.loyaltyDiscountFormat, 'detailed');
});
