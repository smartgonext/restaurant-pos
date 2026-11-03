const fs = require('fs');
const path = require('path');
const XLSX = require(path.resolve(__dirname, '../../web/node_modules/xlsx'));

const allFolders = JSON.parse(fs.readFileSync('api/scripts/all-download-folders.json', 'utf8'));
const filePath = 'C:/Users/kumar/Downloads/amora_bakes_stock_import_invoice_added.xlsx';
const wb = XLSX.readFile(filePath);
const nonKot = XLSX.utils.sheet_to_json(wb.Sheets['Non KOT Items'], { defval: '' });

// Normalize helper
function norm(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

console.log('Checking direct exact folder match for all items in Non KOT Items:');
let exactMatches = 0;
let fuzzyMatches = 0;
let unmatched = [];

for (let i = 0; i < nonKot.length; i++) {
  const item = nonKot[i];
  const name = item.SignatureName;
  const nameNorm = norm(name);

  // 1. Direct norm match
  let found = allFolders.find(f => norm(f) === nameNorm);
  if (found) {
    exactMatches++;
    continue;
  }

  // 2. Starts with or contains
  found = allFolders.find(f => {
    const fn = norm(f);
    return fn.startsWith(nameNorm) || nameNorm.startsWith(fn);
  });
  if (found) {
    fuzzyMatches++;
    continue;
  }

  unmatched.push({ index: i + 1, name, qr: item.ProductQR });
}

console.log(`Exact matches: ${exactMatches}`);
console.log(`Prefix/Fuzzy matches: ${fuzzyMatches}`);
console.log(`Unmatched items count: ${unmatched.length}`);
if (unmatched.length > 0) {
  console.log('Unmatched items:');
  console.log(unmatched);
}

