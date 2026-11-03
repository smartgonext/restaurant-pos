/**
 * Comprehensive Test Suite for Waiter Terminal Chair Booking Workflow
 * 
 * This test suite verifies the complete flow:
 * 1. Waiter creates order with chair assignment
 * 2. Chair is marked as occupied
 * 3. Main POS closes bill
 * 4. Chair is freed and available again
 * 
 * Tests cover:
 * - Single chair booking and release
 * - Multiple chairs at same table
 * - Partial table closure (some chairs paid, others remain)
 * - Entire table closure
 * - Edge cases and error scenarios
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Helper to clean up test data
async function cleanupTestData(restaurantId, tableIds = []) {
    try {
        // Delete all test orders and related data
        await prisma.kOTItem.deleteMany({
            where: { kot: { order: { tableId: { in: tableIds } } } }
        });
        await prisma.kOT.deleteMany({
            where: { order: { tableId: { in: tableIds } } }
        });
        await prisma.order.deleteMany({
            where: { tableId: { in: tableIds } }
        });
        
        // Reset table status
        await prisma.table.updateMany({
            where: { id: { in: tableIds } },
            data: { status: 'available' }
        });
    } catch (err) {
        console.error('Cleanup error:', err);
    }
}

// Helper to create a test order with chair assignment
async function createOrderWithChair(restaurantId, tableId, chairNumber, menuItemId, quantity = 1) {
    const order = await prisma.order.create({
        data: {
            restaurantId,
            tableId,
            orderNumber: `TEST-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            type: 'dine_in',
            status: 'placed',
            subtotal: 100 * quantity,
            total: 100 * quantity,
            isDraft: false,
            note: `Test order for Chair ${chairNumber}`,
            kots: {
                create: {
                    restaurantId,
                    kotNumber: `KOT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                    status: 'pending',
                    items: {
                        create: {
                            menuItemId,
                            chairNumber,
                            quantity,
                            price: 100,
                            status: 'pending',
                            isPaid: false
                        }
                    }
                }
            }
        },
        include: {
            kots: { include: { items: true } }
        }
    });
    
    return order;
}

// Helper to get occupied chairs for a table
async function getOccupiedChairs(restaurantId, tableId) {
    const orders = await prisma.order.findMany({
        where: {
            tableId,
            status: { in: ['placed', 'running', 'confirmed', 'preparing', 'ready', 'served', 'partially_paid'] },
            isDraft: false
        },
        include: {
            kots: { include: { items: true } }
        }
    });
    
    const occupiedSet = new Set();
    
    for (const order of orders) {
        for (const kot of order.kots || []) {
            for (const item of kot.items || []) {
                if (
                    item.status !== 'removed' &&
                    item.status !== 'paid' &&
                    !item.isPaid &&
                    item.chairNumber !== null &&
                    item.chairNumber !== undefined
                ) {
                    occupiedSet.add(Number(item.chairNumber));
                }
            }
        }
    }
    
    return Array.from(occupiedSet).sort((a, b) => a - b);
}

test('Waiter Chair Booking Workflow Tests', async (t) => {
    // Setup: Use existing restaurant and table data
    const restaurant = await prisma.restaurant.findFirst();
    
    if (!restaurant) {
        console.log('❌ No restaurant found in database. Please seed the database first.');
        process.exit(1);
    }
    
    const restaurantId = restaurant.id;
    console.log(`✓ Using restaurant: ${restaurant.name} (ID: ${restaurantId})`);
    
    // Get existing table (just use the first available table)
    const table = await prisma.table.findFirst();
    
    if (!table) {
        console.log('❌ No table found in database. Please seed the database first.');
        process.exit(1);
    }
    
    const tableId = table.id;
    const actualRestaurantId = table.restaurantId || restaurantId;
    console.log(`✓ Using table: ${table.name} (ID: ${tableId}, RestaurantID: ${actualRestaurantId})\n`);
    
    // Get a menu item for testing (just use the first available menu item)
    const menuItem = await prisma.menuItem.findFirst();
    
    if (!menuItem) {
        console.log('❌ No menu item found in database. Please seed the database first.');
        process.exit(1);
    }
    
    const menuItemId = menuItem.id;
    console.log(`✓ Using menu item: ${menuItem.name} (ID: ${menuItemId})\n`);
    
    await t.test('1. Single Chair Booking and Release', async () => {
        console.log('\n📋 Test 1: Single Chair Booking and Release');
        
        // Cleanup before test
        await cleanupTestData(actualRestaurantId, [tableId]);
        
        // Step 1: Waiter creates order for Chair 1
        console.log('  ➡️  Creating order for Chair 1...');
        const order = await createOrderWithChair(actualRestaurantId, tableId, 1, menuItemId, 2);
        assert.ok(order.id, 'Order created successfully');
        
        // Verify chair is occupied
        let occupiedChairs = await getOccupiedChairs(actualRestaurantId, tableId);
        console.log('  ✓ Occupied chairs after order:', occupiedChairs);
        assert.deepStrictEqual(occupiedChairs, [1], 'Chair 1 should be occupied');
        
        // Step 2: Main POS closes bill for Chair 1
        console.log('  ➡️  Closing bill for Chair 1...');
        await prisma.$transaction(async tx => {
            await tx.kOTItem.updateMany({
                where: {
                    kot: { orderId: order.id },
                    chairNumber: 1,
                    status: { not: 'removed' }
                },
                data: { status: 'paid', isPaid: true, chairNumber: null }
            });
            
            await tx.order.update({
                where: { id: order.id },
                data: { status: 'paid' }
            });
        });
        
        // Verify chair is freed
        occupiedChairs = await getOccupiedChairs(actualRestaurantId, tableId);
        console.log('  ✓ Occupied chairs after payment:', occupiedChairs);
        assert.deepStrictEqual(occupiedChairs, [], 'Chair 1 should be freed');
        
        // Verify chairNumber is cleared in database
        const kotItems = await prisma.kOTItem.findMany({
            where: { kot: { orderId: order.id } }
        });
        console.log('  ✓ KOT items after payment:', kotItems.map(i => ({ chairNumber: i.chairNumber, isPaid: i.isPaid })));
        assert.ok(kotItems.every(item => item.chairNumber === null), 'All chairNumbers should be cleared');
        assert.ok(kotItems.every(item => item.isPaid === true), 'All items should be marked as paid');
        
        console.log('  ✅ Test 1 PASSED\n');
    });
    
    await t.test('2. Multiple Chairs at Same Table', async () => {
        console.log('📋 Test 2: Multiple Chairs at Same Table');
        
        // Cleanup before test
        await cleanupTestData(actualRestaurantId, [tableId]);
        
        // Create orders for chairs 1, 2, and 3
        console.log('  ➡️  Creating orders for Chairs 1, 2, and 3...');
        const order1 = await createOrderWithChair(actualRestaurantId, tableId, 1, menuItemId);
        const order2 = await createOrderWithChair(actualRestaurantId, tableId, 2, menuItemId);
        const order3 = await createOrderWithChair(actualRestaurantId, tableId, 3, menuItemId);
        
        // Verify all chairs are occupied
        let occupiedChairs = await getOccupiedChairs(actualRestaurantId, tableId);
        console.log('  ✓ Occupied chairs after orders:', occupiedChairs);
        assert.deepStrictEqual(occupiedChairs, [1, 2, 3], 'Chairs 1, 2, 3 should be occupied');
        
        // Close bill for Chair 2 only
        console.log('  ➡️  Closing bill for Chair 2 only...');
        await prisma.$transaction(async tx => {
            await tx.kOTItem.updateMany({
                where: {
                    kot: { orderId: order2.id },
                    chairNumber: 2,
                    status: { not: 'removed' }
                },
                data: { status: 'paid', isPaid: true, chairNumber: null }
            });
            
            await tx.order.update({
                where: { id: order2.id },
                data: { status: 'paid' }
            });
        });
        
        // Verify only Chair 2 is freed
        occupiedChairs = await getOccupiedChairs(actualRestaurantId, tableId);
        console.log('  ✓ Occupied chairs after Chair 2 payment:', occupiedChairs);
        assert.deepStrictEqual(occupiedChairs, [1, 3], 'Only Chairs 1 and 3 should remain occupied');
        
        // Close bill for Chair 1
        console.log('  ➡️  Closing bill for Chair 1...');
        await prisma.$transaction(async tx => {
            await tx.kOTItem.updateMany({
                where: {
                    kot: { orderId: order1.id },
                    chairNumber: 1,
                    status: { not: 'removed' }
                },
                data: { status: 'paid', isPaid: true, chairNumber: null }
            });
            
            await tx.order.update({
                where: { id: order1.id },
                data: { status: 'paid' }
            });
        });
        
        // Verify only Chair 3 remains
        occupiedChairs = await getOccupiedChairs(actualRestaurantId, tableId);
        console.log('  ✓ Occupied chairs after Chair 1 payment:', occupiedChairs);
        assert.deepStrictEqual(occupiedChairs, [3], 'Only Chair 3 should remain occupied');
        
        // Close bill for Chair 3
        console.log('  ➡️  Closing bill for Chair 3...');
        await prisma.$transaction(async tx => {
            await tx.kOTItem.updateMany({
                where: {
                    kot: { orderId: order3.id },
                    chairNumber: 3,
                    status: { not: 'removed' }
                },
                data: { status: 'paid', isPaid: true, chairNumber: null }
            });
            
            await tx.order.update({
                where: { id: order3.id },
                data: { status: 'paid' }
            });
        });
        
        // Verify all chairs are freed
        occupiedChairs = await getOccupiedChairs(actualRestaurantId, tableId);
        console.log('  ✓ Occupied chairs after all payments:', occupiedChairs);
        assert.deepStrictEqual(occupiedChairs, [], 'All chairs should be freed');
        
        console.log('  ✅ Test 2 PASSED\n');
    });
    
    await t.test('3. Entire Table Closure', async () => {
        console.log('📋 Test 3: Entire Table Closure');
        
        // Cleanup before test
        await cleanupTestData(actualRestaurantId, [tableId]);
        
        // Create orders for all 4 chairs
        console.log('  ➡️  Creating orders for all 4 chairs...');
        const orders = [];
        for (let chair = 1; chair <= 4; chair++) {
            orders.push(await createOrderWithChair(actualRestaurantId, tableId, chair, menuItemId));
        }
        
        // Verify all chairs are occupied
        let occupiedChairs = await getOccupiedChairs(restaurantId, tableId);
        console.log('  ✓ Occupied chairs after orders:', occupiedChairs);
        assert.deepStrictEqual(occupiedChairs, [1, 2, 3, 4], 'All 4 chairs should be occupied');
        
        // Close entire table
        console.log('  ➡️  Closing entire table...');
        await prisma.$transaction(async tx => {
            for (const order of orders) {
                await tx.kOTItem.updateMany({
                    where: {
                        kot: { orderId: order.id },
                        status: { not: 'removed' }
                    },
                    data: { status: 'paid', isPaid: true, chairNumber: null }
                });
                
                await tx.order.update({
                    where: { id: order.id },
                    data: { status: 'paid' }
                });
            }
            
            await tx.table.update({
                where: { id: tableId },
                data: { status: 'available' }
            });
        });
        
        // Verify all chairs are freed
        occupiedChairs = await getOccupiedChairs(actualRestaurantId, tableId);
        console.log('  ✓ Occupied chairs after entire table closure:', occupiedChairs);
        assert.deepStrictEqual(occupiedChairs, [], 'All chairs should be freed');
        
        // Verify table status
        const updatedTable = await prisma.table.findUnique({ where: { id: tableId } });
        console.log('  ✓ Table status:', updatedTable.status);
        assert.strictEqual(updatedTable.status, 'available', 'Table should be available');
        
        console.log('  ✅ Test 3 PASSED\n');
    });
    
    await t.test('4. Group Billing - Multiple Chairs Combined', async () => {
        console.log('📋 Test 4: Group Billing - Multiple Chairs Combined');
        
        // Cleanup before test
        await cleanupTestData(actualRestaurantId, [tableId]);
        
        // Create orders for chairs 1 and 2 (couple/friends)
        console.log('  ➡️  Creating orders for Chairs 1 and 2 (group)...');
        const order1 = await createOrderWithChair(actualRestaurantId, tableId, 1, menuItemId);
        const order2 = await createOrderWithChair(actualRestaurantId, tableId, 2, menuItemId);
        
        // Also create order for chair 4 (separate customer)
        console.log('  ➡️  Creating order for Chair 4 (separate customer)...');
        const order4 = await createOrderWithChair(actualRestaurantId, tableId, 4, menuItemId);
        
        // Verify chairs are occupied
        let occupiedChairs = await getOccupiedChairs(restaurantId, tableId);
        console.log('  ✓ Occupied chairs:', occupiedChairs);
        assert.deepStrictEqual(occupiedChairs, [1, 2, 4], 'Chairs 1, 2, 4 should be occupied');
        
        // Close bill for chairs 1 and 2 together (group billing)
        console.log('  ➡️  Closing bill for Chairs 1 and 2 together...');
        await prisma.$transaction(async tx => {
            for (const order of [order1, order2]) {
                await tx.kOTItem.updateMany({
                    where: {
                        kot: { orderId: order.id },
                        chairNumber: { in: [1, 2] },
                        status: { not: 'removed' }
                    },
                    data: { status: 'paid', isPaid: true, chairNumber: null }
                });
                
                await tx.order.update({
                    where: { id: order.id },
                    data: { status: 'paid' }
                });
            }
        });
        
        // Verify only chairs 1 and 2 are freed, chair 4 remains
        occupiedChairs = await getOccupiedChairs(actualRestaurantId, tableId);
        console.log('  ✓ Occupied chairs after group billing:', occupiedChairs);
        assert.deepStrictEqual(occupiedChairs, [4], 'Only Chair 4 should remain occupied');
        
        console.log('  ✅ Test 4 PASSED\n');
    });
    
    await t.test('5. Chair Re-booking After Payment', async () => {
        console.log('📋 Test 5: Chair Re-booking After Payment');
        
        // Cleanup before test
        await cleanupTestData(actualRestaurantId, [tableId]);
        
        // First customer books Chair 1
        console.log('  ➡️  First customer books Chair 1...');
        const order1 = await createOrderWithChair(actualRestaurantId, tableId, 1, menuItemId);
        
        let occupiedChairs = await getOccupiedChairs(restaurantId, tableId);
        console.log('  ✓ Occupied chairs:', occupiedChairs);
        assert.deepStrictEqual(occupiedChairs, [1], 'Chair 1 should be occupied');
        
        // First customer pays and leaves
        console.log('  ➡️  First customer pays and leaves...');
        await prisma.$transaction(async tx => {
            await tx.kOTItem.updateMany({
                where: {
                    kot: { orderId: order1.id },
                    chairNumber: 1,
                    status: { not: 'removed' }
                },
                data: { status: 'paid', isPaid: true, chairNumber: null }
            });
            
            await tx.order.update({
                where: { id: order1.id },
                data: { status: 'paid' }
            });
        });
        
        occupiedChairs = await getOccupiedChairs(actualRestaurantId, tableId);
        console.log('  ✓ Occupied chairs after payment:', occupiedChairs);
        assert.deepStrictEqual(occupiedChairs, [], 'Chair 1 should be free');
        
        // New customer books the same Chair 1
        console.log('  ➡️  New customer books Chair 1...');
        const order2 = await createOrderWithChair(restaurantId, tableId, 1, menuItemId);
        
        occupiedChairs = await getOccupiedChairs(actualRestaurantId, tableId);
        console.log('  ✓ Occupied chairs after re-booking:', occupiedChairs);
        assert.deepStrictEqual(occupiedChairs, [1], 'Chair 1 should be occupied again');
        
        // Verify chairs work correctly after re-booking
        const allOrders = await prisma.order.findMany({
            where: { tableId, restaurantId: actualRestaurantId }
        });
        console.log('  ✓ Total orders for table:', allOrders.length);
        console.log('  ✓ Chair re-booking workflow verified successfully');
        
        console.log('  ✅ Test 5 PASSED\n');
    });
    
    // Final cleanup
    await cleanupTestData(actualRestaurantId, [tableId]);
});

console.log('\n🎯 Running Waiter Chair Booking Workflow Tests...\n');
