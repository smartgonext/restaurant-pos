const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const items = await prisma.menuItem.findMany({
    where: {
      OR: [
        { name: { contains: 'Livinda' } },
        { name: { contains: 'STAR DRY' } }
      ]
    },
    include: {
      inventoryItem: {
        include: {
          inventoryMRPs: true
        }
      }
    }
  });

  for (const it of items) {
    console.log('MenuItem:', it.name, 'price:', it.price);
    console.log('  inventoryItem:', it.inventoryItem ? {
      id: it.inventoryItem.id,
      name: it.inventoryItem.name,
      mrps: it.inventoryItem.inventoryMRPs
    } : null);
  }
}

check().catch(console.error).finally(() => prisma.$disconnect());
