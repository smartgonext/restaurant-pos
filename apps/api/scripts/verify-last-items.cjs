const { PrismaClient } = require('../node_modules/@prisma/client');
const path = require('path');
const os = require('os');
const electronDbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'restaurant-saas-electron', 'restaurant.db');
const prisma = new PrismaClient({ datasources: { db: { url: `file:${electronDbPath}` } } });

async function checkLast() {
  const items = await prisma.menuItem.findMany({
    where: {
      name: { in: [
        'Pudding Cake Carrot',
        'Pudding Cake Dates',
        'Pudding Cake Jackfruit',
        'Lotte Gift Jewel 8',
        'Lotte Gift Orange',
        'Elite Brownie Furi',
        'Bournville 70% Rich Cocoa 75g',
        'Bournville RC 75g Carton Pack'
      ] }
    },
    include: {
      inventoryItem: { select: { costPerUnit: true, currentStock: true } }
    }
  });

  console.log(items.map(i => ({
    name: i.name,
    barcode: i.productQR,
    price: i.price,
    cost: i.inventoryItem?.costPerUnit,
    stock: i.inventoryItem?.currentStock,
    image: i.image
  })));

  await prisma.$disconnect();
}
checkLast();

