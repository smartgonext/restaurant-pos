const { PrismaClient } = require('../node_modules/@prisma/client');
const path = require('path');

const dbs = [
  path.resolve(__dirname, '../prisma/sqlite-template/dev.db'),
  path.resolve(__dirname, '../sqlite-template/dev.db'),
  path.resolve(__dirname, '../prisma/maligai.db')
];

async function run() {
  for (const db of dbs) {
    const prisma = new PrismaClient({ datasources: { db: { url: 'file:' + db } } });
    const total = await prisma.menuItem.count();
    const nonKot = await prisma.menuItem.count({ where: { category: { isKOTEnabled: false } } });
    const kot = await prisma.menuItem.count({ where: { category: { isKOTEnabled: true } } });
    
    // Sample new items
    const sample = await prisma.menuItem.findMany({
      where: { name: { in: ['MSK Vanilla 170ml', '3Roses Natural Care 100gm', 'Kissan Fresh Tomato 500g', 'Lipton Green Tea Clear&Light 25S'] } },
      select: { name: true, productQR: true, price: true, image: true }
    });
    console.log(path.basename(path.dirname(db)) + '/' + path.basename(db), '=> Total:', total, '(Non-KOT:', nonKot, 'KOT:', kot + ')');
    console.log('Sample:', sample);
    await prisma.$disconnect();
  }
}
run();
