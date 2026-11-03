const { execSync } = require('child_process');
const path = require('path');

const sqlite3 = require('../node_modules/@prisma/client');
console.log('Testing schema against databases...');

const { PrismaClient } = require('../node_modules/@prisma/client');

async function testPrisma(dbName, dbFile) {
  console.log(`\n--- Testing Prisma queries on ${dbName} (${dbFile}) ---`);
  const prisma = new PrismaClient({
    datasources: { db: { url: `file:${dbFile}` } }
  });

  const tests = [
    ['Restaurant', () => prisma.restaurant.findMany({ take: 1 })],
    ['RestaurantSettings', () => prisma.restaurantSettings.findMany({ take: 1 })],
    ['BillSettings', () => prisma.billSettings.findMany({ take: 1 })],
    ['Menu', () => prisma.menu.findMany({ take: 1 })],
    ['MenuItem', () => prisma.menuItem.findMany({ take: 1 })],
    ['ItemCategory', () => prisma.itemCategory.findMany({ take: 1 })],
    ['Branch', () => prisma.branch.findMany({ take: 1 })],
    ['Staff', () => prisma.staff.findMany({ take: 1 })],
    ['Role', () => prisma.role.findMany({ take: 1 })],
    ['CashRegisterSession', () => prisma.cashRegisterSession.findMany({ take: 1 })],
    ['Order', () => prisma.order.findMany({ take: 1 })],
    ['KOT', () => prisma.kOT.findMany({ take: 1 })],
    ['KOTItem', () => prisma.kOTItem.findMany({ take: 1 })],
    ['InventoryItem', () => prisma.inventoryItem.findMany({ take: 1 })],
    ['MainPOSTerminal', () => prisma.mainPOSTerminal.findMany({ take: 1 })],
    ['SubPOSTerminal', () => prisma.subPOSTerminal.findMany({ take: 1 })],
    ['SuperAdminUser', () => prisma.superAdminUser.findMany({ take: 1 })]
  ];

  let passed = 0;
  let failed = 0;

  for (const [name, fn] of tests) {
    try {
      await fn();
      passed++;
    } catch (err) {
      console.error(`  ❌ ${name} failed: ${err.message.split('\n')[0]}`);
      failed++;
    }
  }

  console.log(`Summary for ${dbName}: ${passed} passed, ${failed} failed`);
  await prisma.$disconnect();
}

(async () => {
  const os = require('os');
  await testPrisma('devDb', path.resolve('api/prisma/sqlite-template/dev.db'));
  await testPrisma('appDataDb', path.join(os.homedir(), 'AppData', 'Roaming', 'restaurant-saas-electron', 'restaurant.db'));
  await testPrisma('prismaMaligai', path.resolve('api/prisma/maligai.db'));
})();
