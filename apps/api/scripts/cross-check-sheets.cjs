const fs = require('fs');
const path = require('path');
const XLSX = require(path.resolve(__dirname, '../../web/node_modules/xlsx'));

const filePath = 'C:/Users/kumar/Downloads/amora_bakes_stock_import_invoice_added.xlsx';
const wb = XLSX.readFile(filePath);

const nonKot = XLSX.utils.sheet_to_json(wb.Sheets['Non KOT Items'], { defval: '' });
console.log('Total Non-KOT items in sheet:', nonKot.length);

// Look at rows from 280 to 324
console.log('\n--- Rows 280 to 324 in "Non KOT Items" ---');
for (let i = 280; i < nonKot.length; i++) {
  const r = nonKot[i];
  console.log(`[Row ${i+1}] Barcode: "${r.ProductQR}" | Name: "${r.SignatureName}" | MRP: ${r.MRP} | Cost: ${r.PurchaseRate} | Price: ${r.SellingPrice} | Qty: ${r.Qty} | Cat: "${r.Category}" | Expiry: "${r.ExpiryDate}"`);
}

// Cross-check: Are there products in "Invoice Calculation" that are NOT in "Non KOT Items"?
const invoiceSheet = XLSX.utils.sheet_to_json(wb.Sheets['Invoice Calculation'], { defval: '' });
console.log('\nTotal items in "Invoice Calculation":', invoiceSheet.length);

const nonKotNames = new Set(nonKot.map(r => r.SignatureName.trim().toLowerCase()));

console.log('\n--- Check if any Invoice items are missing from Non KOT Items sheet ---');
const missingInNonKot = [];
for (const inv of invoiceSheet) {
  const name = (inv.Product || '').trim().toLowerCase();
  if (!name) continue;
  let match = false;
  for (const n of nonKotNames) {
    if (n.includes(name) || name.includes(n)) {
      match = true;
      break;
    }
  }
  if (!match) {
    missingInNonKot.push(inv);
  }
}
console.log(`Missing Invoice items not in Non KOT: ${missingInNonKot.length}`);
if (missingInNonKot.length > 0) {
  console.log(missingInNonKot.slice(0, 10));
}

// Check "Packing Slip Audit" as well
const packingSheet = XLSX.utils.sheet_to_json(wb.Sheets['Packing Slip Audit'], { defval: '' });
console.log('\nTotal items in "Packing Slip Audit":', packingSheet.length);
const missingPacking = [];
for (const ps of packingSheet) {
  const name = (ps.Product || '').trim().toLowerCase();
  if (!name) continue;
  let match = false;
  for (const n of nonKotNames) {
    if (n.includes(name) || name.includes(n)) {
      match = true;
      break;
    }
  }
  if (!match) {
    missingPacking.push(ps);
  }
}
console.log(`Missing Packing items not in Non KOT: ${missingPacking.length}`);
if (missingPacking.length > 0) {
  console.log(missingPacking.slice(0, 10));
}

