const { PrismaClient } = require('../node_modules/@prisma/client');
const path = require('path');
const os = require('os');

async function verify() {
  const electronDbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'restaurant-saas-electron', 'restaurant.db');
  const prisma = new PrismaClient({
    datasources: { db: { url: `file:${electronDbPath}` } },
  });
  
  const totalItems = await prisma.menuItem.count();
  const kotItems = await prisma.menuItem.count({ where: { category: { isKOTEnabled: true } } });
  const nonKotItems = await prisma.menuItem.count({ where: { category: { isKOTEnabled: false } } });
  const categories = await prisma.itemCategory.findMany({
    select: { name: true, isKOTEnabled: true, _count: { select: { menuItems: true } } }
  });
  const itemsWithImages = await prisma.menuItem.count({ where: { image: { not: null } } });
  const sampleItems = await prisma.menuItem.findMany({
    take: 8,
    include: {
      category: { select: { name: true, isKOTEnabled: true } },
      inventoryItem: { select: { sku: true, barcode: true, costPerUnit: true, currentStock: true } }
    }
  });

  console.log(JSON.stringify({
    totalItems,
    kotItems,
    nonKotItems,
    itemsWithImages,
    categoryCount: categories.length,
    categoriesSummary: categories.map(c => `${c.name} (${c.isKOTEnabled ? 'KOT' : 'Non-KOT'}): ${c._count.menuItems} items`),
    sampleItems: sampleItems.map(i => ({
      name: i.name,
      category: i.category?.name,
      isKOTEnabled: i.category?.isKOTEnabled,
      price: i.price,
      productQR: i.productQR,
      inventoryBarcode: i.inventoryItem?.barcode,
      purchaseRate: i.inventoryItem?.costPerUnit,
      stock: i.inventoryItem?.currentStock,
      image: i.image
    }))
  }, null, 2));

  await prisma.$disconnect();
}
verify();
