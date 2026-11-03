const fs = require('fs');
const path = require('path');

const amoraNonKot = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../prisma/amora-non-kot-products.json'), 'utf8'));

console.log('Total items in amora-non-kot-products.json:', amoraNonKot.length);

const lastItems = amoraNonKot.slice(-30);
console.log('\n--- Last 30 items in amora-non-kot-products.json ---');
for (const item of lastItems) {
  console.log(`Barcode: ${item.barcode} | Name: "${item.name}" | Price: ${item.price} | MRP: ${item.mrp} | Cost: ${item.purchaseRate} | Stock: ${item.stock} | Image: "${item.image}"`);
}

