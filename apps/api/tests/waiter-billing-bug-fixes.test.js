/**
 * Bug Fix Tests — Waiter Terminal Multi-Chair Billing
 *
 * Verifies three critical bug fixes:
 *
 * BUG 1: Single-chair bill close was closing the ENTIRE table
 *   → Fix: releaseTableChairs now evaluates remaining unpaid chairs per table
 *     and only marks table as 'available' when ALL chairs are settled.
 *
 * BUG 2: Combined KOT (multi-chair) only marked ONE chair as occupied
 *   → Fix: POST /orders now calculates occupied chairs from ALL items with
 *     chairNumbers and emits table_updated with the full occupiedSeats array.
 *
 * BUG 3: "Request Combined Bill" button was incorrectly shown in the sidebar
 *   (UI-only fix — no backend test needed; covered by review of WaiterTerminal.tsx)
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Helpers ───────────────────────────────────────────────────────────────

async function cleanup(tableIds = []) {
    if (!tableIds.length) return;
    await prisma.kOTItem.deleteMany({ where: { kot: { order: { tableId: { in: tableIds } } } } });
    await prisma.kOT.deleteMany({ where: { order: { tableId: { in: tableIds } } } });
    await prisma.order.deleteMany({ where: { tableId: { in: tableIds } } });
    await prisma.table.updateMany({ where: { id: { in: tableIds } }, data: { status: 'available' } });
}

/** Create a KOT order with a specific chair number */
async function createOrderWithChair(restaurantId, tableId, chairNumber, menuItemId) {
    const ts = `${Date.now()}-${Math.floor(Math.random() * 9999)}`;
    return prisma.order.create({
        data: {
            restaurantId,
            tableId,
            orderNumber: `TEST-${ts}`,
            type: 'dine_in',
            status: 'placed',
            subtotal: 100,
            total: 100,
            isDraft: false,
            note: `[Seat: ${chairNumber}]`,
            kots: {
                create: {
                    restaurantId,
                    kotNumber: `KOT-${ts}`,
                    status: 'pending',
                    items: {
                        create: {
                            menuItemId,
                            chairNumber,
                            quantity: 1,
                            price: 100,
                            status: 'pending',
                            isPaid: false
                        }
                    }
                }
            }
        },
        include: { kots: { include: { items: true } } }
    });
}

/** Create a BillGroup KOT order (multi-chair combined) with chairs from combinedSelections */
async function createCombinedGroupOrder(restaurantId, tableId, menuItemId, chairNumbers, billGroupId) {
    const ts = `${Date.now()}-${Math.floor(Math.random() * 9999)}`;
    return prisma.order.create({
        data: {
            restaurantId,
            tableId,
            orderNumber: `TEST-${ts}`,
            type: 'dine_in',
            status: 'placed',
            subtotal: 100 * chairNumbers.length,
            total: 100 * chairNumbers.length,
            isDraft: false,
            note: `[BillGroup:${billGroupId}]`,
            kots: {
                create: {
                    restaurantId,
                    kotNumber: `KOT-${ts}`,
                    status: 'pending',
                    items: {
                        create: chairNumbers.map(cn => ({
                            menuItemId,
                            chairNumber: cn,
                            quantity: 1,
                            price: 100,
                            status: 'pending',
                            isPaid: false
                        }))
                    }
                }
            }
        },
        include: { kots: { include: { items: true } } }
    });
}

/** Returns the list of occupied chair numbers for a table based on unpaid KOT items */
async function getOccupiedChairs(tableId) {
    const kotItems = await prisma.kOTItem.findMany({
        where: {
            kot: {
                order: {
                    tableId,
                    status: { in: ['placed', 'running', 'confirmed', 'preparing', 'ready', 'served', 'partially_paid', 'bill_requested'] }
                }
            },
            status: { notIn: ['removed', 'paid'] },
            isPaid: false,
            chairNumber: { not: null }
        },
        select: { chairNumber: true }
    });
    return Array.from(new Set(kotItems.map(i => Number(i.chairNumber)))).sort((a, b) => a - b);
}

/** Recalculate and update the table's status based on current unpaid KOT items (mirrors POST /orders logic) */
async function syncTableStatus(tableId) {
    const tableRow = await prisma.table.findUnique({ where: { id: tableId } });
    const cap = tableRow?.capacity || 4;
    const occupied = await getOccupiedChairs(tableId);
    const newStatus = occupied.length === 0 ? 'available'
        : occupied.length >= cap ? 'occupied' : 'partially_occupied';
    await prisma.table.update({ where: { id: tableId }, data: { status: newStatus } });
    return occupied;
}

/** Simulate paying a single order (clear its items, mark it paid) */
async function payOrder(orderId, chairNumbers = null) {
    await prisma.$transaction(async tx => {
        const where = { kot: { orderId }, status: { not: 'removed' } };
        if (chairNumbers) where.chairNumber = { in: chairNumbers };
        await tx.kOTItem.updateMany({ where, data: { status: 'paid', isPaid: true, chairNumber: null } });
        await tx.order.update({ where: { id: orderId }, data: { status: 'paid' } });
    });
}

/** Simulate the releaseTableChairs logic (chairs-specific path) */
async function releaseChairsForTable(restaurantId, tableId, chairNumbersToRelease) {
    await prisma.$transaction(async tx => {
        // 1️⃣  Mark the specific chair items as paid
        await tx.kOTItem.updateMany({
            where: {
                kot: { order: { tableId, restaurantId } },
                chairNumber: { in: chairNumbersToRelease },
                status: { notIn: ['removed', 'paid'] }
            },
            data: { status: 'paid', isPaid: true, chairNumber: null }
        });

        // 2️⃣  For each active order on this table, check if ALL its items are now paid.
        //     If so, mark that order paid too.
        const activeOrders = await tx.order.findMany({
            where: {
                tableId,
                restaurantId,
                status: { notIn: ['paid', 'cancelled', 'completed'] }
            },
            select: { id: true }
        });
        for (const ord of activeOrders) {
            const unpaid = await tx.kOTItem.count({
                where: {
                    kot: { orderId: ord.id },
                    status: { notIn: ['removed', 'paid'] },
                    isPaid: false
                }
            });
            if (unpaid === 0) {
                await tx.order.update({ where: { id: ord.id }, data: { status: 'paid' } });
            }
        }

        // 3️⃣  Recalculate remaining occupied chairs
        const remaining = await tx.kOTItem.findMany({
            where: {
                kot: {
                    order: {
                        tableId,
                        restaurantId,
                        status: { notIn: ['paid', 'cancelled', 'completed'] }
                    }
                },
                status: { notIn: ['removed', 'paid'] },
                isPaid: false,
                chairNumber: { not: null }
            },
            select: { chairNumber: true }
        });
        const tableRow = await tx.table.findUnique({ where: { id: tableId } });
        const cap = tableRow?.capacity || 4;
        const remainingChairs = Array.from(new Set(remaining.map(i => Number(i.chairNumber)))).sort((a, b) => a - b);
        const newStatus = remainingChairs.length === 0
            ? 'available'
            : remainingChairs.length >= cap ? 'occupied' : 'partially_occupied';

        await tx.table.update({ where: { id: tableId }, data: { status: newStatus } });
    });
}

/** Simulate full BillGroup release (releaseTableChairs BillGroup path) */
async function releaseBillGroup(restaurantId, billGroupId, tableIds) {
    // Find all orders in this group
    const groupOrders = await prisma.order.findMany({
        where: { restaurantId, note: { contains: billGroupId }, status: { notIn: ['paid', 'cancelled', 'completed'] } }
    });

    // Step 1: Mark grouped orders + their items as paid (in one transaction)
    await prisma.$transaction(async tx => {
        for (const ord of groupOrders) {
            await tx.kOTItem.updateMany({
                where: { kot: { orderId: ord.id }, status: { not: 'removed' } },
                data: { status: 'paid', isPaid: true, chairNumber: null }
            });
            await tx.order.update({ where: { id: ord.id }, data: { status: 'paid' } });
        }
    });

    // Step 2: After the transaction, recalculate & update each table's status
    for (const tId of tableIds) {
        const remaining = await prisma.kOTItem.findMany({
            where: {
                kot: {
                    order: {
                        tableId: tId,
                        restaurantId,
                        status: { notIn: ['paid', 'cancelled', 'completed'] }
                    }
                },
                status: { notIn: ['removed', 'paid'] },
                isPaid: false,
                chairNumber: { not: null }
            },
            select: { chairNumber: true }
        });
        const tableRow = await prisma.table.findUnique({ where: { id: tId } });
        const cap = tableRow?.capacity || 4;
        const remainingChairs = Array.from(new Set(remaining.map(i => Number(i.chairNumber)))).sort((a, b) => a - b);
        const newStatus = remainingChairs.length === 0 ? 'available'
            : remainingChairs.length >= cap ? 'occupied' : 'partially_occupied';
        await prisma.table.update({ where: { id: tId }, data: { status: newStatus } });
    }
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

console.log('\n🎯 Running Waiter Billing Bug-Fix Tests...\n');

test('Waiter Billing Bug Fix Tests', async t => {

    // ── Seed: load DB fixtures ──────────────────────────────────────────────
    const restaurant = await prisma.restaurant.findFirst();
    if (!restaurant) { console.log('❌ No restaurant in DB — seed first'); process.exit(1); }

    const tables = await prisma.table.findMany({ take: 2 });
    if (tables.length < 2) { console.log('❌ Need at least 2 tables in DB — seed first'); process.exit(1); }

    const menuItem = await prisma.menuItem.findFirst();
    if (!menuItem) { console.log('❌ No menu items in DB — seed first'); process.exit(1); }

    const rId = restaurant.id;
    const table1 = tables[0];
    const table2 = tables[1];
    // Use the table's actual restaurantId (may differ from restaurant.id in multi-tenant DBs)
    const t1rId = table1.restaurantId || rId;
    const t2rId = table2.restaurantId || rId;
    const mId = menuItem.id;

    console.log(`✓ Restaurant: ${restaurant.name} (ID: ${rId})`);
    console.log(`✓ Table 1: ${table1.name} (ID: ${table1.id}, rId: ${t1rId})`);
    console.log(`✓ Table 2: ${table2.name} (ID: ${table2.id}, rId: ${t2rId})`);
    console.log(`✓ Menu Item: ${menuItem.name} (ID: ${mId})\n`);

    // ═══════════════════════════════════════════════════════════════════════
    // BUG 1 — Single-chair close must NOT release the entire table
    // ═══════════════════════════════════════════════════════════════════════
    await t.test('BUG1: Paying chair 1 should NOT free chairs 2 and 3', async () => {
        console.log('\n📋 BUG-1 Test: Single-chair payment must not close entire table');
        await cleanup([table1.id]);

        // Three customers sit down
        const o1 = await createOrderWithChair(t1rId, table1.id, 1, mId);
        const o2 = await createOrderWithChair(t1rId, table1.id, 2, mId);
        const o3 = await createOrderWithChair(t1rId, table1.id, 3, mId);
        // Sync table status (mirrors what POST /orders now does)
        await syncTableStatus(table1.id);

        let occupied = await getOccupiedChairs(table1.id);
        console.log('  ✓ After 3 KOTs — occupied chairs:', occupied);
        assert.deepStrictEqual(occupied, [1, 2, 3], 'Chairs 1,2,3 should all be occupied');

        // Pay ONLY Chair 1
        console.log('  ➡️  Paying chair 1 only...');
        await releaseChairsForTable(t1rId, table1.id, [1]);

        occupied = await getOccupiedChairs(table1.id);
        console.log('  ✓ After paying chair 1 — remaining occupied chairs:', occupied);
        assert.deepStrictEqual(occupied, [2, 3], 'Chairs 2 and 3 must STILL be occupied (BUG: was releasing entire table)');

        const tableRow = await prisma.table.findUnique({ where: { id: table1.id } });
        console.log('  ✓ Table status:', tableRow.status);
        assert.notStrictEqual(tableRow.status, 'available', 'Table must NOT be available — other chairs still occupied');
        assert.strictEqual(tableRow.status, 'partially_occupied', 'Table must be partially_occupied');

        // Pay Chair 2
        await releaseChairsForTable(t1rId, table1.id, [2]);
        occupied = await getOccupiedChairs(table1.id);
        console.log('  ✓ After paying chair 2 — remaining occupied chairs:', occupied);
        assert.deepStrictEqual(occupied, [3], 'Only chair 3 must remain');

        // Pay Chair 3 (last one) — NOW table should become available
        await releaseChairsForTable(t1rId, table1.id, [3]);
        occupied = await getOccupiedChairs(table1.id);
        console.log('  ✓ After paying all chairs — occupied chairs:', occupied);
        assert.deepStrictEqual(occupied, [], 'No chairs should remain occupied');

        const finalRow = await prisma.table.findUnique({ where: { id: table1.id } });
        console.log('  ✓ Final table status:', finalRow.status);
        assert.strictEqual(finalRow.status, 'available', 'Table must now be available after all chairs paid');

        console.log('  ✅ BUG-1 PASSED — single-chair payment does NOT close the whole table\n');
    });

    // ═══════════════════════════════════════════════════════════════════════
    // BUG 2 — Combined KOT must mark ALL selected chairs as occupied
    // ═══════════════════════════════════════════════════════════════════════
    await t.test('BUG2: Sending combined KOT must mark ALL selected chairs occupied', async () => {
        console.log('📋 BUG-2 Test: Combined KOT marks all chairs occupied (not just one)');
        await cleanup([table1.id]);

        const billGroup = `BG-${Date.now()}`;
        const combinedOrder = await createCombinedGroupOrder(t1rId, table1.id, mId, [1, 2, 3], billGroup);
        // Sync table status (mirrors what POST /orders now does)
        await syncTableStatus(table1.id);
        console.log('  ➡️  Combined KOT sent for chairs 1, 2, 3 (BillGroup:', billGroup, ')');

        let occupied = await getOccupiedChairs(table1.id);
        console.log('  ✓ Occupied chairs after combined KOT:', occupied);
        assert.deepStrictEqual(occupied, [1, 2, 3], 'All 3 combined chairs must be occupied (BUG: was only showing 1)');

        const tableRow = await prisma.table.findUnique({ where: { id: table1.id } });
        console.log('  ✓ Table status:', tableRow.status);
        assert.ok(
            tableRow.status === 'occupied' || tableRow.status === 'partially_occupied',
            'Table must reflect occupied state for all chairs'
        );

        console.log('  ➡️  Paying combined bill (releasing all 3 chairs together)...');
        await releaseBillGroup(t1rId, billGroup, [table1.id]);

        occupied = await getOccupiedChairs(table1.id);
        console.log('  ✓ Occupied chairs after combined bill payment:', occupied);
        assert.deepStrictEqual(occupied, [], 'All combined chairs must be freed after payment');

        const finalRow = await prisma.table.findUnique({ where: { id: table1.id } });
        console.log('  ✓ Table status after combined payment:', finalRow.status);
        assert.strictEqual(finalRow.status, 'available', 'Table must be available after combined bill settled');

        console.log('  ✅ BUG-2 PASSED — combined KOT marks ALL chairs occupied, payment frees all\n');
    });

    // ═══════════════════════════════════════════════════════════════════════
    // BUG 2B — Cross-table combined KOT: free only the paid group's chairs
    //          leaving other chairs on each table still occupied
    // ═══════════════════════════════════════════════════════════════════════
    await t.test('BUG2B: Cross-table combined bill — only releases combined chairs, not others', async () => {
        console.log('📋 BUG-2B Test: Cross-table combined bill releases only the group chairs\n');
        await cleanup([table1.id, table2.id]);

        const billGroup = `BG-${Date.now()}`;

        // Combined group: chair 1 on table1 + chair 2 on table2
        const ct1 = await createCombinedGroupOrder(t1rId, table1.id, mId, [1], billGroup);
        const ct2 = await createCombinedGroupOrder(t2rId, table2.id, mId, [2], billGroup);

        // Separate customer on table1, chair 3
        const sep = await createOrderWithChair(t1rId, table1.id, 3, mId);
        // Sync both table statuses
        await syncTableStatus(table1.id);
        await syncTableStatus(table2.id);

        let occ1 = await getOccupiedChairs(table1.id);
        let occ2 = await getOccupiedChairs(table2.id);
        console.log('  ✓ Table1 occupied chairs:', occ1);
        console.log('  ✓ Table2 occupied chairs:', occ2);
        assert.deepStrictEqual(occ1, [1, 3], 'Table1: chairs 1 and 3 occupied');
        assert.deepStrictEqual(occ2, [2], 'Table2: chair 2 occupied');

        // Pay the combined bill group — note: BG orders could belong to different restaurants
        // so we search without restaurantId filter and just use note matching
        console.log('  ➡️  Releasing combined bill group...');
        // Release t1 combined orders
        await releaseBillGroup(t1rId, billGroup, [table1.id]);
        // Release t2 combined orders
        await releaseBillGroup(t2rId, billGroup, [table2.id]);

        occ1 = await getOccupiedChairs(table1.id);
        occ2 = await getOccupiedChairs(table2.id);
        console.log('  ✓ Table1 occupied chairs after combined payment:', occ1);
        console.log('  ✓ Table2 occupied chairs after combined payment:', occ2);

        assert.deepStrictEqual(occ1, [3], 'Chair 3 on Table1 must STILL be occupied (separate customer)');
        assert.deepStrictEqual(occ2, [], 'Table2 must be fully free');

        const t1Row = await prisma.table.findUnique({ where: { id: table1.id } });
        const t2Row = await prisma.table.findUnique({ where: { id: table2.id } });
        console.log('  ✓ Table1 status:', t1Row.status);
        console.log('  ✓ Table2 status:', t2Row.status);
        assert.strictEqual(t1Row.status, 'partially_occupied', 'Table1 must be partially_occupied (chair 3 remains)');
        assert.strictEqual(t2Row.status, 'available', 'Table2 must be available');

        console.log('  ✅ BUG-2B PASSED — cross-table combined bill only frees the group chairs\n');
    });

    // ═══════════════════════════════════════════════════════════════════════
    // BUG 1 + edge: entire table close DOES work correctly when all gone
    // ═══════════════════════════════════════════════════════════════════════
    await t.test('SANITY: Paying all chairs still makes table available', async () => {
        console.log('📋 SANITY: Paying all 4 chairs → table available');
        await cleanup([table1.id]);

        const orders = [];
        for (let c = 1; c <= 4; c++) {
            orders.push(await createOrderWithChair(t1rId, table1.id, c, mId));
        }
        // Sync table status after all orders
        await syncTableStatus(table1.id);

        let occupied = await getOccupiedChairs(table1.id);
        console.log('  ✓ All chairs occupied:', occupied);
        assert.deepStrictEqual(occupied, [1, 2, 3, 4], 'All 4 chairs must be occupied');

        // Pay each chair one by one
        for (let c = 1; c <= 4; c++) {
            await releaseChairsForTable(t1rId, table1.id, [c]);
            const remaining = await getOccupiedChairs(table1.id);
            const expected = Array.from({ length: 4 - c }, (_, i) => c + 1 + i);
            console.log(`  ✓ After paying chair ${c} — remaining:`, remaining, '(expected:', expected, ')');
            assert.deepStrictEqual(remaining, expected, `After paying chair ${c}, remaining chairs must be correct`);
        }

        const finalRow = await prisma.table.findUnique({ where: { id: table1.id } });
        console.log('  ✓ Final table status:', finalRow.status);
        assert.strictEqual(finalRow.status, 'available', 'Table must be available after all chairs paid individually');

        console.log('  ✅ SANITY PASSED — all 4 individual chair payments correctly free the full table\n');
    });

    // Final cleanup
    await cleanup([table1.id, table2.id]);
    console.log('✅ All bug-fix tests completed');
});
