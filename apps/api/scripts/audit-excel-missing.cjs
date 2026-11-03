const fs = require('fs');
const path = require('path');
const XLSX = require(path.resolve(__dirname, '../../web/node_modules/xlsx'));

const filePath = 'C:/Users/kumar/Downloads/amora_bakes_stock_import_invoice_added.xlsx';
const wb = XLSX.readFile(filePath);
const ws = wb.Sheets['Non KOT Items'];
const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

console.log('Total rows in Non KOT Items:', rows.length);

const missingFields = {
  emptyQR: [],
  emptyMRP: [],
  emptyPurchaseRate: [],
  emptySellingPrice: [],
  emptyQty: [],
  emptyCategory: [],
};

rows.forEach((r, idx) => {
  if (!r.ProductQR || String(r.ProductQR).trim() === '') missingFields.emptyQR.push({ row: idx + 2, name: r.SignatureName });
  if (!r.MRP || String(r.MRP).trim() === '') missingFields.emptyMRP.push({ row: idx + 2, name: r.SignatureName });
  if (!r.PurchaseRate || String(r.PurchaseRate).trim() === '') missingFields.emptyPurchaseRate.push({ row: idx + 2, name: r.SignatureName });
  if (!r.SellingPrice || String(r.SellingPrice).trim() === '') missingFields.emptySellingPrice.push({ row: idx + 2, name: r.SignatureName });
  if (!r.Qty || String(r.Qty).trim() === '') missingFields.emptyQty.push({ row: idx + 2, name: r.SignatureName });
  if (!r.Category || String(r.Category).trim() === '') missingFields.emptyCategory.push({ row: idx + 2, name: r.SignatureName });
});

console.log(`Empty QR: ${missingFields.emptyQR.length}`);
console.log(`Empty MRP: ${missingFields.emptyMRP.length}`);
console.log(`Empty PurchaseRate: ${missingFields.emptyPurchaseRate.length}`);
console.log(`Empty SellingPrice: ${missingFields.emptySellingPrice.length}`);
console.log(`Empty Qty: ${missingFields.emptyQty.length}`);
console.log(`Empty Category: ${missingFields.emptyCategory.length}`);

console.log('\nRows with empty QR in Excel:');
console.log(missingFields.emptyQR);

