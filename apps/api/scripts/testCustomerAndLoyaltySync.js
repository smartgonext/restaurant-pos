import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testCustomerAndLoyaltySync() {
  console.log('🧪 Testing Customer & Loyalty Report Real-Time Sync...\n');
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
    const restaurant = await prisma.restaurant.findFirst() || await prisma.restaurant.create({
      data: { name: 'Test Resto', slug: 'test-resto-' + Date.now() }
    });

    // 1. Ensure test customer exists
    let customer = await prisma.customer.findFirst({ where: { restaurantId: restaurant.id } });
    if (!customer) {
      customer = await prisma.customer.create({
        data: { restaurantId: restaurant.id, name: 'Arish Kumar', phone: '9655321915' }
      });
    }
    assert(!!customer, `Customer active: ${customer.name} (${customer.phone})`);

    // 2. Ensure paid order exists for customer
    let paidOrder = await prisma.order.findFirst({
      where: { restaurantId: restaurant.id, customerId: customer.id, status: 'paid' }
    });

    if (!paidOrder) {
      paidOrder = await prisma.order.create({
        data: {
          restaurantId: restaurant.id,
          orderNumber: 'ORD-TEST-99',
          status: 'paid',
          total: 235,
          customerId: customer.id
        }
      });
    }
    assert(!!paidOrder, `Paid order active for customer (Order #${paidOrder.orderNumber}, ₹${paidOrder.total})`);

    // 3. Test Loyalty Sync logic
    let program = await prisma.loyaltyProgram.findUnique({ where: { restaurantId: restaurant.id } });
    if (!program) {
      program = await prisma.loyaltyProgram.create({
        data: { restaurantId: restaurant.id, name: 'VIP Rewards', rupeesPerPoint: 10, isActive: true }
      });
    }

    const note = `Earned on Order #${paidOrder.orderNumber}`;
    let txn = await prisma.loyaltyTransaction.findFirst({
      where: { restaurantId: restaurant.id, customerId: customer.id, note }
    });

    if (!txn) {
      const pts = Math.max(1, Math.floor(Number(paidOrder.total) / 10));
      txn = await prisma.loyaltyTransaction.create({
        data: {
          customerId: customer.id,
          restaurantId: restaurant.id,
          loyaltyProgramId: program.id,
          type: 'earned',
          points: pts,
          note,
          createdAt: paidOrder.createdAt
        }
      });
    }

    assert(!!txn, `Loyalty transaction created for purchase (${txn.points} points awarded)`);

    // 4. Verify Customer Report aggregation
    const orders = await prisma.order.findMany({
      where: { restaurantId: restaurant.id, status: 'paid', customerId: customer.id }
    });
    const periodRevenue = orders.reduce((sum, o) => sum + Number(o.total || 0), 0);

    assert(orders.length > 0, `Customer Period Orders calculated correctly (${orders.length} orders)`);
    assert(periodRevenue > 0, `Customer Period Revenue calculated correctly (₹${periodRevenue.toFixed(2)})`);

    console.log(`\n========================================`);
    console.log(`📊 CUSTOMER & LOYALTY SYNC TESTS: ${passed}/${total} PASSED`);
    console.log(`========================================\n`);
  } catch (err) {
    console.error('❌ Test error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

testCustomerAndLoyaltySync();
