const fs = require('fs');
const path = require('path');
const XLSX = require(path.resolve(__dirname, '../../web/node_modules/xlsx'));

const filePath = 'C:/Users/kumar/Downloads/amora_bakes_stock_import_invoice_added.xlsx';
const wb = XLSX.readFile(filePath);
const nonKot = XLSX.utils.sheet_to_json(wb.Sheets['Non KOT Items'], { defval: '' });

const missingCost = nonKot.filter(r => !r.PurchaseRate || r.PurchaseRate === '' || Number(r.PurchaseRate) === 0);
console.log(`Items with missing/zero PurchaseRate in Excel: ${missingCost.length}`);
console.log('First 10 items missing cost:');
for (const it of missingCost.slice(0, 10)) {
  console.log(`[QR: ${it.ProductQR}] ${it.SignatureName} | MRP: ${it.MRP} | Cost: ${it.PurchaseRate} | Price: ${it.SellingPrice} | Cat: ${it.Category}`);
}

