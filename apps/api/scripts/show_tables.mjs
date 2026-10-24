import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function showTables() {
  const tables = await prisma.table.findMany({
    where: { restaurantId: 1 },
    select: { name: true, qrToken: true },
  });
  console.log('Available Tables for The Spice Kitchen:');
  tables.forEach(t => console.log(`Table ${t.name}: ${t.qrToken}`));
  await prisma.$disconnect();
}

showTables().catch(e => {
  console.error(e);
  prisma.$disconnect();
});
