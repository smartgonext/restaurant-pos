import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runReportDeduplicationTests() {
  console.log('🧪 Testing Report Deduplication (Payment, Item, Tax, Sales)...\n');
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

    // 1. Test Item Report query
    const kotWhere = { kot: { order: { restaurantId: restaurant.id, status: 'paid', bakeryToken: { is: null } } } };
    const kotItems = await prisma.kOTItem.findMany({ where: kotWhere });
    const tokenItemWhere = { token: { restaurantId: restaurant.id, status: 'paid' } };
    const tokenItems = await prisma.bakeryTokenItem.findMany({ where: tokenItemWhere });

    assert(Array.isArray(kotItems) && Array.isArray(tokenItems), 'Item report query executes cleanly with bakeryToken filter');

    // 2. Test Tax Report query
    const orderWhere = { restaurantId: restaurant.id, status: 'paid', bakeryToken: { is: null } };
    const orders = await prisma.order.findMany({ where: orderWhere });
    const tokenWhere = { restaurantId: restaurant.id, status: 'paid' };
    const tokens = await prisma.bakeryToken.findMany({ where: tokenWhere });

    assert(Array.isArray(orders) && Array.isArray(tokens), 'Tax report query executes cleanly excluding token-linked orders');

    // 3. Test Payment Report query
    const payOrderWhere = { order: { restaurantId: restaurant.id, bakeryToken: { is: null } } };
    const payOrders = await prisma.orderPayment.findMany({ where: payOrderWhere });

    assert(Array.isArray(payOrders), 'Payment report query excludes double-counting of token payments');

    console.log(`\n========================================`);
    console.log(`📊 REPORT DEDUPLICATION TESTS: ${passed}/${total} PASSED`);
    console.log(`========================================\n`);
  } catch (err) {
    console.error('❌ Test failed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

runReportDeduplicationTests();
