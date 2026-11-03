const fs = require('fs');
const path = require('path');
const XLSX = require(path.resolve(__dirname, '../../web/node_modules/xlsx'));

const userListLines = fs.readFileSync('api/scripts/user-exact-barcodes.tsv', 'utf8').split('\n').filter(Boolean);
const userItems = userListLines.map(line => {
  const [qr, ...nameParts] = line.split('\t');
  return {
    qr: (qr || '').trim(),
    name: nameParts.join('\t').trim()
  };
}).filter(u => u.name);

console.log('Total user items parsed:', userItems.length);

const amoraNonKot = JSON.parse(fs.readFileSync('api/prisma/amora-non-kot-products.json', 'utf8'));
console.log('Current amora-non-kot-products.json items:', amoraNonKot.length);

function norm(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const existingByNorm = new Map();
const existingByQR = new Map();
for (const item of amoraNonKot) {
  existingByNorm.set(norm(item.name), item);
  if (item.productQR) existingByQR.set(item.productQR, item);
}

let matchedCount = 0;
let qrUpdatedCount = 0;
const newItemsToAdd = [];

for (const u of userItems) {
  const n = norm(u.name);
  const byName = existingByNorm.get(n);
  const byQR = u.qr ? existingByQR.get(u.qr) : null;

  if (byName) {
    matchedCount++;
    if (u.qr && byName.productQR !== u.qr) {
      qrUpdatedCount++;
      // console.log(`QR Update for "${byName.name}": "${byName.productQR}" -> "${u.qr}"`);
    }
  } else if (byQR) {
    matchedCount++;
    // console.log(`Matched by QR "${u.qr}": "${byQR.name}" vs user "${u.name}"`);
  } else {
    newItemsToAdd.push(u);
  }
}

console.log(`Matched existing items: ${matchedCount}`);
console.log(`Items whose QR needs updating to user exact QR: ${qrUpdatedCount}`);
console.log(`Brand new items in user list: ${newItemsToAdd.length}`);
if (newItemsToAdd.length > 0) {
  console.log('New items sample:');
  console.log(newItemsToAdd);
}

