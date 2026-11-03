const { PrismaClient } = require('../node_modules/@prisma/client');
const path = require('path');

const dbs = [
  path.resolve(__dirname, '../prisma/sqlite-template/dev.db'),
  path.resolve(__dirname, '../sqlite-template/dev.db'),
  path.resolve(__dirname, '../prisma/maligai.db'),
  path.resolve(__dirname, '../maligai.db')
];

async function check() {
  for (const db of dbs) {
    const prisma = new PrismaClient({ datasources: { db: { url: 'file:' + db } } });
    try {
      const cols = await prisma.$queryRawUnsafe('PRAGMA table_info("Order");');
      console.log(path.basename(db), 'has deliveryExecutiveId:', cols.some(c => c.name === 'deliveryExecutiveId'));
    } catch(e) {
      console.log(path.basename(db), 'error:', e.message);
    } finally {
      await prisma.$disconnect();
    }
  }
}
check();

