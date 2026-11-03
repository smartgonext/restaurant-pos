const fs = require('fs');
const path = require('path');
const os = require('os');
const XLSX = require('xlsx');

const excelPath = 'C:/Users/kumar/Downloads/amora_bakes_stock_import_with_new_invoice_items.xlsx';
const wb = XLSX.readFile(excelPath);
const rawItems = XLSX.utils.sheet_to_json(wb.Sheets['Non KOT Items']);

console.log('Total rows in new Excel:', rawItems.length);

const existingProducts = require('../prisma/amora-non-kot-products.json');
const existingMap = new Map();
existingProducts.forEach(p => existingMap.set(p.productQR, p));

const uploadDirs = [
  path.resolve(__dirname, '../uploads'),
  path.resolve(__dirname, '../../web/public/uploads'),
  path.resolve(__dirname, '../../web/dist/uploads'),
  path.join(os.homedir(), 'AppData', 'Roaming', 'restaurant-saas-electron', 'uploads'),
];

uploadDirs.forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// Map for the 29 new items
const newItemsMapping = {
  '7622202325960': 'downloads/bournville_70_rich_cocoa_75g/candidate_2.jpg',
  '7622202325908': 'downloads/bournville_fruit_nut_75g/candidate_2.jpg',
  '7622202325991': 'downloads/bournville_rc_75g_carton_pack/candidate_2.jpg',
  '7622202846878': 'downloads/bournvita_500g_jar/candidate_2.jpg',
  '7622202846786': 'downloads/cadbury_fuse_23g_rs_20_nuts/candidate_2.jpg',
  '7622202362002': 'downloads/pm_chococlush_69gm_60pk/candidate_2.webp',
  '7622202818332': 'downloads/cadbury_dairy_milk_12_1g_x_56_flowpack/candidate_2.jpg',
  '7622202818363': 'downloads/cadbury_dairy_milk_20_2g_rs_20/candidate_2.jpg',
  '7622202884160': 'downloads/cadbury_dairy_milk_44g_rs_45/candidate_2.jpg',
  '7622202818301': 'downloads/cadbury_dairy_milk_6_1g_x_72_rs_5/candidate_2.jpg',
  '7622202346385': 'downloads/cadbury_dairy_milk_44g_rs_45/candidate_1.jpg',
  '7622202324758': 'downloads/cadbury_dairy_milk_44g_rs_45/candidate_3.png',
  '7622202271861': 'downloads/cadbury_dairy_milk_20_2g_rs_20/candidate_1.png',
  '7622202842368': 'downloads/bournville_fruit_nut_75g/candidate_1.jpg',
  '7622202326325': 'downloads/bournville_70_rich_cocoa_75g/candidate_1.jpg',
  '7622202842269': 'downloads/bournville_fruit_nut_75g/candidate_3.jpg',
  '7622202326059': 'downloads/cadbury_dairy_milk_12_1g_x_56_flowpack/candidate_1.jpg',
  '7622202326080': 'downloads/cadbury_dairy_milk_20_2g_rs_20/candidate_3.jpg',
  '7622202326110': 'downloads/cadbury_dairy_milk_6_1g_x_72_rs_5/candidate_1.jpg',
  '7622202325878': 'downloads/cadbury_dairy_milk_44g_rs_45/candidate_2.jpg',
  '7622202842399': 'downloads/cadbury_fuse_23g_rs_20_nuts/candidate_1.png',
  '7622201712631': 'downloads/vintage_chocolate_chips_cookies_400gm_12/candidate_2.jpg',
  '7622202818400': 'downloads/cadbury_fuse_23g_rs_20_nuts/candidate_3.jpg',
  '7622202818431': 'downloads/cadbury_fuse_23g_rs_20_nuts/candidate_1.png',
  '7622202225550': 'downloads/treat_jim_jam_92gm_75pk/candidate_2.jpg',
  '7622202225512': 'downloads/treat_jim_jam_92gm_75pk/candidate_1.jpg',
  '7622202819339': 'downloads/kaprika_wafers_chocolate_120gm_60/candidate_2.jpg',
  '7622202852565': 'downloads/kaprika_wafers_chocolate_120gm_60/candidate_1.jpg',
  '7622202852541': 'downloads/treat_jim_jam_92gm_75pk/candidate_3.jpg'
};

// Process each item in new Excel
const consolidated = [];
const byBarcode = new Map();

rawItems.forEach((row, idx) => {
  let qr = String(row.ProductQR || '').trim();
  const name = String(row.SignatureName || '').trim();
  const mrp = Number(row.MRP || 0);
  const purchaseRate = Number(row.PurchaseRate || 0);
  const profitPercent = Number(row.ProfitPercent || 0);
  const sellingPrice = Number(row.SellingPrice || mrp || 0);
  const qty = Number(row.Qty || 1);
  const category = String(row.Category || 'Biscuits & Chocolates').trim();
  const stockWarn = Number(row.StockWarn || 5);
  const taxType = String(row.TaxType || 'include').toLowerCase();
  const taxPercent = Number(row.TaxPercent || 0);

  // Handle Kokao Bullet
  if (name === 'Kokao Bullet 1kg') {
    qr = '8950600060787_1';
  }

  // Check if we already have an existing image
  let image = null;
  if (existingMap.has(qr)) {
    image = existingMap.get(qr).image;
  } else if (newItemsMapping[qr]) {
    const src = newItemsMapping[qr];
    const ext = path.extname(src);
    const destFileName = `amora_${qr}${ext}`;
    uploadDirs.forEach(dir => {
      try {
        fs.copyFileSync(src, path.join(dir, destFileName));
      } catch(e) {}
    });
    image = `/uploads/${destFileName}`;
  } else {
    // Fallback
    image = '/uploads/amora_8901063012608.jpg';
  }

  const productObj = {
    id: idx + 1,
    productQR: qr,
    name,
    mrp,
    purchaseRate,
    profitPercent,
    sellingPrice,
    salesUnit: 'Piece (pc)',
    qty,
    category,
    group: 'Non KOT',
    assignedMenu: 'General Menu',
    stockWarn,
    taxType,
    taxPercent,
    image,
    isKOTEnabled: false
  };

  if (byBarcode.has(qr)) {
    const existing = byBarcode.get(qr);
    existing.qty = (existing.qty || 0) + qty;
  } else {
    byBarcode.set(qr, productObj);
    consolidated.push(productObj);
  }
});

console.log('Total consolidated unique Non-KOT products:', consolidated.length);

// Save amora-non-kot-products.json
fs.writeFileSync(path.resolve(__dirname, '../prisma/amora-non-kot-products.json'), JSON.stringify(consolidated, null, 2));
console.log('Saved updated amora-non-kot-products.json');

