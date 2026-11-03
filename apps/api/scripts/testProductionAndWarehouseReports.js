import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testProductionAndWarehouseReports() {
  console.log('🧪 Testing Production & Warehouse Reports & Transit Inventory...\n');
  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`  ✅ PASSED: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAILED: ${message}`);
    }
  }

  try {
    const restaurant = await prisma.restaurant.findFirst();
    if (!restaurant) return;

    let branch = await prisma.branch.findFirst({ where: { restaurantId: restaurant.id } });
    if (!branch) {
      branch = await prisma.branch.create({
        data: { restaurantId: restaurant.id, name: 'Main Kitchen Warehouse' }
      });
    }

    let branch2 = await prisma.branch.findFirst({ where: { restaurantId: restaurant.id, id: { not: branch.id } } });
    if (!branch2) {
      branch2 = await prisma.branch.create({
        data: { restaurantId: restaurant.id, name: 'Express Retail Outlet' }
      });
    }

    let category = await prisma.inventoryItemCategory.findFirst({ where: { restaurantId: restaurant.id } });
    if (!category) {
      category = await prisma.inventoryItemCategory.create({
        data: { restaurantId: restaurant.id, name: 'Bakery' }
      });
    }

    let unit = await prisma.inventoryUnit.findFirst({ where: { restaurantId: restaurant.id } });
    if (!unit) {
      unit = await prisma.inventoryUnit.create({
        data: { restaurantId: restaurant.id, name: 'Kilograms', symbol: 'kg' }
      });
    }

    let cakeItem = await prisma.inventoryItem.findFirst({ where: { restaurantId: restaurant.id, name: 'Chocolate Cake' } });
    if (!cakeItem) {
      cakeItem = await prisma.inventoryItem.create({
        data: { restaurantId: restaurant.id, name: 'Chocolate Cake', categoryId: category.id, unitId: unit.id, costPerUnit: 150, currentStock: 50 }
      });
    }

    let croissantItem = await prisma.inventoryItem.findFirst({ where: { restaurantId: restaurant.id, name: 'Butter Croissant' } });
    if (!croissantItem) {
      croissantItem = await prisma.inventoryItem.create({
        data: { restaurantId: restaurant.id, name: 'Butter Croissant', categoryId: category.id, unitId: unit.id, costPerUnit: 40, currentStock: 120 }
      });
    }

    let puffItem = await prisma.inventoryItem.findFirst({ where: { restaurantId: restaurant.id, name: 'Paneer Puff' } });
    if (!puffItem) {
      puffItem = await prisma.inventoryItem.create({
        data: { restaurantId: restaurant.id, name: 'Paneer Puff', categoryId: category.id, unitId: unit.id, costPerUnit: 25, currentStock: 80 }
      });
    }

    // Seed test transfers if zero
    const totalTransfers = await prisma.warehouseTransfer.count({ where: { restaurantId: restaurant.id } });
    if (totalTransfers === 0) {
      const now = new Date();
      const d1 = new Date(now.getTime() - 4 * 24 * 3600 * 1000);
      const d2 = new Date(now.getTime() - 2 * 24 * 3600 * 1000);

      await prisma.warehouseTransfer.create({
        data: {
          restaurantId: restaurant.id,
          fromBranchId: branch.id,
          toBranchId: branch2.id,
          transferNumber: `TRF-${Date.now()}-1`,
          status: 'shipped',
          shippedAt: now,
          createdAt: now,
          items: {
            create: [
              { inventoryItemId: cakeItem.id, quantityShipped: 10, unitCost: 140 },
              { inventoryItemId: croissantItem.id, quantityShipped: 30, unitCost: 35 }
            ]
          }
        }
      });

      await prisma.warehouseTransfer.create({
        data: {
          restaurantId: restaurant.id,
          fromBranchId: branch.id,
          toBranchId: branch2.id,
          transferNumber: `TRF-${Date.now()}-2`,
          status: 'completed_with_discrepancy',
          shippedAt: d1,
          receivedAt: d2,
          createdAt: d2,
          items: {
            create: [
              { inventoryItemId: puffItem.id, quantityShipped: 40, quantityReceived: 38, quantityDamaged: 2, unitCost: 25 }
            ]
          }
        }
      });
    }

    // Check shipped transfer
    let shippedTransfer = await prisma.warehouseTransfer.findFirst({
      where: { restaurantId: restaurant.id, status: 'shipped' },
      include: { items: { include: { inventoryItem: true } } }
    });

    assert(!!shippedTransfer, `Active Shipped Warehouse Transfer present (Number: ${shippedTransfer?.transferNumber || 'N/A'})`);

    const activeTransfers = await prisma.warehouseTransfer.findMany({
      where: { restaurantId: restaurant.id, status: 'shipped' },
      include: { items: { include: { inventoryItem: true } } }
    });

    let totalTransitValuation = 0;
    let totalTransitItemsCount = 0;

    activeTransfers.forEach(t => {
      t.items.forEach(item => {
        const qty = Number(item.quantityShipped || 0);
        totalTransitItemsCount += qty;
        totalTransitValuation += qty * Number(item.unitCost || 0);
      });
    });

    assert(activeTransfers.length > 0, `Active Shipped Transfers count: ${activeTransfers.length}`);
    assert(totalTransitItemsCount > 0, `Total Units in Transit: ${totalTransitItemsCount} units`);
    assert(totalTransitValuation > 0, `Total Value in Transit: ₹${totalTransitValuation.toFixed(2)}`);

    let discrepancyTransfers = await prisma.warehouseTransfer.findMany({
      where: { restaurantId: restaurant.id, status: 'completed_with_discrepancy' }
    });

    assert(discrepancyTransfers.length > 0, `Discrepancy Transfers count: ${discrepancyTransfers.length}`);

    console.log(`\n========================================`);
    console.log(`📊 PRODUCTION & WAREHOUSE TESTS: ${passed}/${total} PASSED`);
    console.log(`========================================\n`);

  } catch (err) {
    console.error('❌ Test error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

testProductionAndWarehouseReports();
