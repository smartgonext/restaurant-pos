const fs = require('fs');
const path = require('path');
const XLSX = require(path.resolve(__dirname, '../../web/node_modules/xlsx'));

const filePath = 'C:/Users/kumar/Downloads/amora_bakes_stock_import_invoice_added.xlsx';
const wb = XLSX.readFile(filePath);

console.log('Sheets in Excel:', wb.SheetNames);

for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  console.log(`\n==================================================`);
  console.log(`Sheet: "${name}" (${rows.length} rows)`);
  console.log(`==================================================`);
  if (rows.length > 0) {
    console.log('Headers:', Object.keys(rows[0]));
    console.log('First 2 rows:');
    console.log(rows.slice(0, 2));
    console.log('Last 5 rows:');
    console.log(rows.slice(-5));

    // Check for missing fields
    const missingPrice = rows.filter(r => !r.SellingPrice && !r['Selling Price'] && !r.Price && !r.MRP);
    const missingCategory = rows.filter(r => !r.Category && !r.CategoryName);
    const missingBarcode = rows.filter(r => !r.ProductQR && !r.Barcode);
    const missingPurchase = rows.filter(r => !r.PurchaseRate && !r['Purchase Rate']);
    const missingName = rows.filter(r => !r.ItemName && !r.ProductName && !r.Name);

    console.log(`Missing Name: ${missingName.length}`);
    console.log(`Missing Category: ${missingCategory.length}`);
    console.log(`Missing Barcode: ${missingBarcode.length}`);
    console.log(`Missing Price/MRP: ${missingPrice.length}`);
    console.log(`Missing PurchaseRate: ${missingPurchase.length}`);
  }
}

