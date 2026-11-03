const path = require('path');
const os = require('os');
const { PrismaClient } = require('../node_modules/@prisma/client');

const dbs = {
  appDataDb: path.join(os.homedir(), 'AppData', 'Roaming', 'restaurant-saas-electron', 'restaurant.db'),
  devDb: path.resolve('api/prisma/sqlite-template/dev.db'),
  apiDb: path.resolve('api/maligai.db'),
  prismaMaligai: path.resolve('api/prisma/maligai.db')
};

async function checkDb(name, filePath) {
  const prisma = new PrismaClient({
    datasources: { db: { url: `file:${filePath}` } }
  });
  try {
    const packages = await prisma.package.count().catch(e => e.message);
    const restaurants = await prisma.restaurant.count().catch(e => e.message);
    const superAdminUsers = await prisma.superAdminUser.count().catch(e => e.message);
    const staff = await prisma.staff.count().catch(e => e.message);
    const menus = await prisma.menu.count().catch(e => e.message);
    const items = await prisma.menuItem.count().catch(e => e.message);
    const itemCategories = await prisma.itemCategory.count().catch(e => e.message);
    const branches = await prisma.branch.count().catch(e => e.message);
    const orders = await prisma.order.count().catch(e => e.message);

    console.log(`\n=== ${name} (${filePath}) ===`);
    console.log({ packages, restaurants, superAdminUsers, staff, menus, items, itemCategories, branches, orders });
  } catch (err) {
    console.error(`Error checking ${name}:`, err.message);
  } finally {
    await prisma.$disconnect();
  }
}

(async () => {
  for (const [name, p] of Object.entries(dbs)) {
    await checkDb(name, p);
  }
})();
