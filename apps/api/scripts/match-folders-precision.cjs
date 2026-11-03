const fs = require('fs');
const path = require('path');
const XLSX = require(path.resolve(__dirname, '../../web/node_modules/xlsx'));

const allFolders = JSON.parse(fs.readFileSync('api/scripts/all-download-folders.json', 'utf8'));
const filePath = 'C:/Users/kumar/Downloads/amora_bakes_stock_import_invoice_added.xlsx';
const wb = XLSX.readFile(filePath);

const nonKot = XLSX.utils.sheet_to_json(wb.Sheets['Non KOT Items'], { defval: '' });
const invoiceSheet = XLSX.utils.sheet_to_json(wb.Sheets['Invoice Calculation'], { defval: '' });

console.log(`Excel Non-KOT rows: ${nonKot.length}`);
console.log(`Excel Invoice rows: ${invoiceSheet.length}`);

// Function to normalize name to tokens
function toTokens(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean);
}

// Find exact or best matching folder for every item
function findBestFolder(itemName, allFolders) {
  const itemTokens = toTokens(itemName);
  let bestFolder = null;
  let maxScore = 0;

  for (const folder of allFolders) {
    const fTokens = toTokens(folder);
    // Score based on shared tokens
    let matches = 0;
    for (const t of itemTokens) {
      if (fTokens.includes(t)) matches++;
    }

    // Bonus if folder name exactly matches or contains distinctive words
    const itemClean = itemName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const folderClean = folder.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (itemClean === folderClean) matches += 100;
    else if (folderClean.startsWith(itemClean) || itemClean.startsWith(folderClean)) matches += 20;

    // Penalty if distinctive keywords differ (e.g. banana vs carrot vs dates vs jackfruit)
    const distincts = ['banana', 'carrot', 'dates', 'jackfruit', 'orange', 'honey', 'milk', 'jewel', 'vanilla', 'chocolate', 'fruit', 'pineapple', 'elachi', 'furi', '18pc', '6pcs', '4pcs', '2pcs', '100rs'];
    for (const d of distincts) {
      if (itemTokens.includes(d) && !fTokens.includes(d)) matches -= 10;
      if (!itemTokens.includes(d) && fTokens.includes(d)) matches -= 5;
    }

    if (matches > maxScore) {
      maxScore = matches;
      bestFolder = folder;
    }
  }

  return { folder: bestFolder, score: maxScore };
}

console.log('\n--- Checking best matches for rows 280 to 324 in Non KOT Items ---');
for (let i = 280; i < nonKot.length; i++) {
  const name = nonKot[i].SignatureName;
  const match = findBestFolder(name, allFolders);
  console.log(`[#${i+1}] "${name}" -> folder: "${match.folder}" (score: ${match.score})`);
}

console.log('\n--- Checking Invoice Calculation sheet items ---');
for (const inv of invoiceSheet) {
  const name = inv.Product;
  if (!name) continue;
  const match = findBestFolder(name, allFolders);
  console.log(`[Inv] "${name}" -> folder: "${match.folder}" (score: ${match.score})`);
}

