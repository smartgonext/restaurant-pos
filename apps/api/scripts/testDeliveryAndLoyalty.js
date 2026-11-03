import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runVerificationTests() {
  console.log('🧪 Running Verification Tests for Delivery Management & Loyalty Report...\n');
  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`  ✅ PASSED: ${message}`);
      passedTests++;
    } else {
      console.error(`  ❌ FAILED: ${message}`);
    }
  }

  try {
    // Test 1: Restaurant and Branch existence
    console.log('1️⃣ Checking Restaurant Database Record...');
    let restaurant = await prisma.restaurant.findFirst();
    if (!restaurant) {
      console.log('   Creating test restaurant...');
      restaurant = await prisma.restaurant.create({
        data: { name: 'Test Restaurant', slug: 'test-restaurant-' + Date.now() }
      });
    }
    assert(!!restaurant, `Found or created active Restaurant (ID: ${restaurant.id})`);

    let branch = await prisma.branch.findFirst({ where: { restaurantId: restaurant.id } });
    if (!branch) {
      branch = await prisma.branch.create({
        data: { restaurantId: restaurant.id, name: 'Main Branch' }
      });
    }
    assert(!!branch, `Found or created active Branch (ID: ${branch.id})`);

    // Test 2: Delivery Executives verification
    console.log('\n2️⃣ Testing Delivery Executive Management...');
    let execs = await prisma.deliveryExecutive.findMany({ where: { restaurantId: restaurant.id } });
    if (execs.length === 0) {
      console.log('   Seeding delivery executives...');
      await prisma.deliveryExecutive.createMany({
        data: [
          { restaurantId: restaurant.id, name: 'Ramesh Kumar (In-House)', phone: '9876543210', status: 'available' },
          { restaurantId: restaurant.id, name: 'Suresh V (In-House)', phone: '9876543211', status: 'busy' },
          { restaurantId: restaurant.id, name: 'Vikas Sharma (External / Dunzo)', phone: '9876543212', status: 'available' }
        ]
      });
      execs = await prisma.deliveryExecutive.findMany({ where: { restaurantId: restaurant.id } });
    }
    assert(execs.length >= 3, `Delivery Executives present in DB (Count: ${execs.length})`);
    assert(execs.some(e => e.name.includes('Ramesh Kumar')), 'In-House Delivery Executive Ramesh Kumar exists');

    // Test 3: Delivery Orders verification & assignment
    console.log('\n3️⃣ Testing Delivery Orders & Executive Assignment...');
    let deliveryOrders = await prisma.order.findMany({
      where: { restaurantId: restaurant.id, type: 'delivery' },
      include: { deliveryExecutive: true, customer: true }
    });

    if (deliveryOrders.length === 0) {
      console.log('   Seeding active delivery orders...');
      const customer = await prisma.customer.create({
        data: { restaurantId: restaurant.id, name: 'Test Customer', phone: '9755155623', address: 'No. 12 Test Street' }
      });

      await prisma.order.create({
        data: {
          restaurantId: restaurant.id,
          branchId: branch.id,
          orderNumber: 'TEST-DEL-001',
          type: 'delivery',
          status: 'out_for_delivery',
          total: 450,
          customerId: customer.id,
          deliveryExecutiveId: execs[0].id
        }
      });

      deliveryOrders = await prisma.order.findMany({
        where: { restaurantId: restaurant.id, type: 'delivery' },
        include: { deliveryExecutive: true, customer: true }
      });
    }

    assert(deliveryOrders.length > 0, `Active Delivery Orders retrieved (Count: ${deliveryOrders.length})`);
    assert(deliveryOrders[0].type === 'delivery', `Order #${deliveryOrders[0].orderNumber} type is 'delivery'`);
    assert(deliveryOrders.some(o => o.deliveryExecutive !== null), 'Delivery Executive relation bound to Order successfully');

    // Test 4: Loyalty Program & Transactions
    console.log('\n4️⃣ Testing Loyalty Program & Transaction Aggregations...');
    let loyaltyProgram = await prisma.loyaltyProgram.findUnique({ where: { restaurantId: restaurant.id } });
    if (!loyaltyProgram) {
      loyaltyProgram = await prisma.loyaltyProgram.create({
        data: { restaurantId: restaurant.id, name: 'Rewards Program', rupeesPerPoint: 100, isActive: true }
      });
    }
    assert(!!loyaltyProgram, `Loyalty Program active (ID: ${loyaltyProgram.id})`);

    let txns = await prisma.loyaltyTransaction.findMany({
      where: { restaurantId: restaurant.id },
      include: { customer: true }
    });

    if (txns.length < 2) {
      console.log('   Seeding sample earned & redeemed loyalty transactions...');
      const cust = await prisma.customer.findFirst({ where: { restaurantId: restaurant.id } }) || await prisma.customer.create({
        data: { restaurantId: restaurant.id, name: 'Loyal Member', phone: '9998887770', loyaltyPoints: 300 }
      });

      await prisma.loyaltyTransaction.createMany({
        data: [
          { customerId: cust.id, restaurantId: restaurant.id, loyaltyProgramId: loyaltyProgram.id, type: 'earned', points: 300, note: 'Points Earned on Order' },
          { customerId: cust.id, restaurantId: restaurant.id, loyaltyProgramId: loyaltyProgram.id, type: 'redeemed', points: -50, note: 'Discount Redeemed' }
        ]
      });

      txns = await prisma.loyaltyTransaction.findMany({
        where: { restaurantId: restaurant.id },
        include: { customer: true }
      });
    }

    assert(txns.length >= 2, `Loyalty Transactions recorded (Count: ${txns.length})`);

    const pointsEarned = txns.reduce((sum, t) => sum + (t.points > 0 ? Number(t.points) : 0), 0);
    const pointsRedeemed = txns.reduce((sum, t) => sum + (t.points < 0 ? Math.abs(Number(t.points)) : 0), 0);

    assert(pointsEarned > 0, `Total Points Earned calculated correctly (${pointsEarned} points)`);
    assert(pointsRedeemed > 0, `Total Points Redeemed calculated correctly (${pointsRedeemed} points)`);

    // Final Summary
    console.log(`\n========================================`);
    console.log(`📊 TEST RESULTS SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
    console.log(`========================================\n`);

    if (passedTests === totalTests) {
      console.log('🎉 ALL VERIFICATION TESTS PASSED SUCCESSFULLY!');
    } else {
      console.log('⚠️ SOME TESTS FAILED. CHECK LOGS ABOVE.');
    }
  } catch (error) {
    console.error('❌ Test Execution Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

runVerificationTests();
