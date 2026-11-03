const fs = require('fs');
const path = require('path');
const os = require('os');
const XLSX = require('xlsx');

const kotDir = path.resolve(__dirname, '../../amora_kot');
const uploadsDir = path.resolve(__dirname, '../uploads');
const webPublicUploads = path.resolve(__dirname, '../../web/public/uploads');
const webDistUploads = path.resolve(__dirname, '../../web/dist/uploads');
const electronUploads = path.join(os.homedir(), 'AppData', 'Roaming', 'restaurant-saas-electron', 'uploads');

[uploadsDir, webPublicUploads, webDistUploads, electronUploads].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// 1. Missing images fallback mapping from api/uploads
const missingImageMap = {
  'Extra Dip': '1788168894478-white-sauce-pasta.jpeg',
  'Extra Cheese': '1788168861455-cheese-add-on-extra.jpeg',
  'Pani Puri': '1777555913111-pani-puri.jpeg',
  'Masala Puri': '1788168498994-masala-puri.jpeg',
  'Bhel Puri': '1788168531183-bhel-puri.jpeg',
  'Thair Puri': '1788168503135-dahi-puri.jpeg',
  'Gobi Chilli': '1777555915261-gobi-chilli.jpeg',
  'Gobi Rass Chilli': '1777555915261-gobi-chilli.jpeg',
  'Gobi Manchurian': '1788074207857-Gobi_Manchurian-1788074207790.jpg',
  'Kalan Chilli': '1788168538966-kalan-chilli.jpeg',
  'Kalan Rass Chilli': '1788168538966-kalan-chilli.jpeg',
  'Kalan Masala': '1788168534684-kalan-masala.jpeg',
  'Kalan Manchurian': '1777555917593-kalan-manchurian.jpeg',
  'Paneer Chilli': '1788168542450-paneer-chilli.jpeg',
  'Paneer Masala': '1788074190649-Paneer_Masala-1788074189924.jpg',
  'Paneer Manchurian': '1788168544295-paneer-manchurian.jpeg',
  'Bread Omelette': '1788168854299-bread-omelette.jpeg',
  'Chicken Bread Omelette': '1788168854299-bread-omelette.jpeg',
  'Egg Chicken Bread Omelette': '1788168854299-bread-omelette.jpeg',
  'Classic Masala Maggi': '1788168857019-classic-masala-maggi.jpeg',
  'Egg Maggi': '1788168858655-egg-maggi.jpeg',
  'Chicken Maggi': '1788168859622-chicken-maggi.jpeg',
  'Cheese Add On': '1788168861455-cheese-add-on-extra.jpeg',
  'Classic Cream Kunafa': '1788168901007-classic-cream-kunafa.jpeg',
  'Crunchy Kunafa': '1788071797626-crunchy-kunafa.jpeg',
  'Classic Nutella Kunafa': '1788168901007-classic-cream-kunafa.jpeg',
  'Plain Waffle': '1788168902405-plain-waffle.jpeg',
  'Chocolate Waffle': '1788168903990-chocolate-waffle.jpeg',
  'Banana Split Waffle': '1788071799156-banana-split-waffle.jpeg',
  'Strawberry Waffle': '1788168905722-strawberry-waffle.jpeg',
  'Naughty Nutella Waffle': '1788071801893-naughty-nutella.jpeg',
  'Lotus Biscoff Waffle': '1788071804110-lotus-biscoff.jpeg',
  'Ginger Tea': '1777555896252-tea.jpeg',
  'Green Tea': '1777647545901-TEA-1777647545820.jpg',
  'Lemon Tea': '1777647554283-TEA-1777647554135.jpg',
  'Honey Lemon Tea': '1777647565217-TEA-1777647564888.jpg',
  'Coffee': '1777555897506-coffee.jpeg',
  'Badam Milk': '1777555898054-badam-milk.jpeg',
  'Horlicks': '1777555900256-horlicks.jpeg',
  'Boost': '1777555899692-boost.jpeg',
};

// Copy missing items into amora_kot directory
console.log('Populating missing images in amora_kot...');
for (const [itemName, srcFile] of Object.entries(missingImageMap)) {
  const destPath = path.join(kotDir, `${itemName}.jpg`);
  const srcPath = path.join(uploadsDir, srcFile);
  if (!fs.existsSync(destPath) && fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`Copied ${srcFile} -> amora_kot/${itemName}.jpg`);
  }
}

// 2. Read Excel
const excelPath = 'c:/Users/kumar/Downloads/amora-kot-items (1).xlsx';
const wb = XLSX.readFile(excelPath);
const sheet = wb.Sheets['KOT Items'];
const rawItems = XLSX.utils.sheet_to_json(sheet);

console.log(`Read ${rawItems.length} KOT items from Excel.`);

const kotFiles = fs.readdirSync(kotDir);
const kotFilesMap = new Map();
kotFiles.forEach(f => kotFilesMap.set(f.toLowerCase().trim(), f));

const processedKotProducts = [];
let matchedImages = 0;

rawItems.forEach((row, idx) => {
  const name = String(row.SignatureName || '').trim();
  const price = Number(row.SellingPrice || 0);
  const qr = String(row.ProductQR || `KOT-${idx + 1}`).trim();
  const category = String(row.Category || 'KOT Specials').trim();
  const isVeg = String(row.VegetarianOption || '').toLowerCase() === 'true';

  let matchedFilename = null;
  const specifiedImage = String(row.Image || '').trim();
  if (specifiedImage && kotFilesMap.has(specifiedImage.toLowerCase())) {
    matchedFilename = kotFilesMap.get(specifiedImage.toLowerCase());
  } else if (kotFilesMap.has(`${name}.jpg`.toLowerCase())) {
    matchedFilename = kotFilesMap.get(`${name}.jpg`.toLowerCase());
  } else if (kotFilesMap.has(`${name}.png`.toLowerCase())) {
    matchedFilename = kotFilesMap.get(`${name}.png`.toLowerCase());
  }

  if (matchedFilename) {
    matchedImages++;
    const src = path.join(kotDir, matchedFilename);
    const ext = path.extname(matchedFilename) || '.jpg';
    const destName = `amora_kot_${qr}${ext}`;

    [uploadsDir, webPublicUploads, webDistUploads, electronUploads].forEach(dir => {
      try {
        fs.copyFileSync(src, path.join(dir, destName));
      } catch (e) {
        console.warn(`Could not copy to ${dir}:`, e.message);
      }
    });

    processedKotProducts.push({
      id: idx + 1,
      productQR: qr,
      name,
      mrp: price,
      purchaseRate: 0,
      profitPercent: 0,
      sellingPrice: price,
      salesUnit: 'Portion',
      qty: 100,
      category,
      group: 'KOT',
      assignedMenu: 'General Menu',
      stockWarn: 5,
      taxType: 'include',
      taxPercent: 5,
      image: `/uploads/${destName}`,
      isVeg,
      isKOTEnabled: true,
    });
  } else {
    console.warn(`⚠️ No image found for: ${name}`);
  }
});

console.log(`Matched ${matchedImages} of ${rawItems.length} images.`);

// Write amora-kot-products.json
const jsonPath = path.resolve(__dirname, '../prisma/amora-kot-products.json');
fs.writeFileSync(jsonPath, JSON.stringify(processedKotProducts, null, 2));
console.log(`Wrote ${processedKotProducts.length} KOT products to ${jsonPath}`);
