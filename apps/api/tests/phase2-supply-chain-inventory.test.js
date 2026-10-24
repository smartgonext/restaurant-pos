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
            await prisma.inventoryMovement.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrder: { restaurantId: rId } } }).catch(() => {});
            await prisma.purchaseOrderPayment.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.purchaseOrder.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.inventoryItemMRP.deleteMany({ where: { inventoryItem: { restaurantId: rId } } }).catch(() => {});
            await prisma.inventoryItem.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.inventoryUnit.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.inventoryItemCategory.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.supplier.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.staff.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.branch.deleteMany({ where: { restaurantId: rId } }).catch(() => {});
            await prisma.restaurant.deleteMany({ where: { id: rId } }).catch(() => {});
        }
    } finally {
        await app.close();
        await prisma.$disconnect();
    }
});

test('Phase 2: Supply Chain, Goods Receiving (GRN) & Multi-Transaction Inventory Engine', { timeout: 60_000 }, async () => {
    const unique = `phase2-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    // 1. Setup Tenant, Branch, Staff
    const restaurant = await prisma.restaurant.create({
        data: {
            name: `Phase2 Resto ${unique}`,
            slug: `phase2-${unique}`,
            email: `p2-${unique}@resto.com`,
            status: 'active',
            enabledModules: '[]',
        },
    });
    created.restaurantId = restaurant.id;

    const branch = await prisma.branch.create({
        data: { restaurantId: restaurant.id, name: 'Phase 2 Branch', branchCode: `B2-${unique}`, isDefault: true },
    });

    const staffPass = 'Pass123!';
    const staffHash = await bcrypt.hash(staffPass, 10);
    const staff = await prisma.staff.create({
        data: {
            restaurantId: restaurant.id,
            branchId: branch.id,
            name: 'Inventory Manager',
            email: `inv-${unique}@resto.com`,
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

    // 2. Setup Category, Unit, Supplier & Item
    const cat = await prisma.inventoryItemCategory.create({ data: { restaurantId: restaurant.id, name: 'Vegetables' } });
    const unit = await prisma.inventoryUnit.create({ data: { restaurantId: restaurant.id, name: 'Kilogram', symbol: 'kg' } });
    const supplier = await prisma.supplier.create({
        data: { restaurantId: restaurant.id, name: 'Fresh Veggies Ltd', phone: '9876543210' },
    });
    const invItem = await prisma.inventoryItem.create({
        data: {
            restaurantId: restaurant.id,
            categoryId: cat.id,
            unitId: unit.id,
            name: 'Tomato',
            currentStock: 50,
            thresholdQty: 10,
            costPerUnit: 25,
        },
    });

    // 3. Create Pending Purchase Order (autoReceive = false)
    const createPoResp = await app.inject({
        method: 'POST',
        url: '/api/restaurant/inventory/purchase-orders',
        headers: authHeader,
        payload: {
            supplierId: supplier.id,
            autoReceive: false,
            items: [
                { inventoryItemId: invItem.id, quantity: 100, unitCost: 20, taxPercent: 5, discountPercent: 0 }
            ]
        }
    });
    assert.equal(createPoResp.statusCode, 200, 'Create PO failed');
    const po = createPoResp.json().data?.purchaseOrder;
    assert.equal(po.status, 'pending');

    // Verify stock remains 50 before GRN
    const itemBeforeGrn = await prisma.inventoryItem.findUnique({ where: { id: invItem.id } });
    assert.equal(Number(itemBeforeGrn.currentStock), 50);

    // 4. TEST GRN GENERATION (Goods Received Note)
    const grnResp = await app.inject({
        method: 'POST',
        url: `/api/restaurant/inventory/purchase-orders/${po.id}/grn`,
        headers: authHeader,
        payload: {
            items: [{ inventoryItemId: invItem.id, quantity: 100 }]
        }
    });
    assert.equal(grnResp.statusCode, 200, 'GRN failed');
    assert.ok(grnResp.json().data?.grnNumber.startsWith('GRN-'));
    assert.equal(grnResp.json().data?.purchaseOrder?.status, 'received');

    // Verify stock increased by 100 -> 150
    const itemAfterGrn = await prisma.inventoryItem.findUnique({ where: { id: invItem.id } });
    assert.equal(Number(itemAfterGrn.currentStock), 150);

    // 5. TEST MULTI-TYPE LEDGER MOVEMENTS (Wastage, Manual Adjustment, Expiry)
    const wastageResp = await app.inject({
        method: 'POST',
        url: '/api/restaurant/inventory/movements/ledger',
        headers: authHeader,
        payload: {
            itemId: invItem.id,
            type: 'wastage',
            quantity: 10,
            note: 'Spoiled due to heat'
        }
    });
    assert.equal(wastageResp.statusCode, 200, 'Wastage movement failed');
    assert.equal(Number(wastageResp.json().data?.currentStock), 140);

    const adjResp = await app.inject({
        method: 'POST',
        url: '/api/restaurant/inventory/movements/ledger',
        headers: authHeader,
        payload: {
            itemId: invItem.id,
            type: 'manual_adjustment',
            quantity: 5,
            note: 'Stock count correction'
        }
    });
    assert.equal(adjResp.statusCode, 200, 'Manual adjustment movement failed');
    assert.equal(Number(adjResp.json().data?.currentStock), 145);

    // 6. TEST WASTAGE AUDIT LOG RETRIEVAL
    const auditResp = await app.inject({
        method: 'GET',
        url: '/api/restaurant/inventory/movements/wastage',
        headers: authHeader,
    });
    assert.equal(auditResp.statusCode, 200, 'Wastage audit failed');
    const logs = auditResp.json().data;
    assert.ok(logs.some(l => l.type === 'wastage' && Number(l.quantity) === 10));

    console.log('✅ Phase 2 Supply Chain, GRN & Multi-Transaction Inventory tests passed 100% cleanly!');
});
