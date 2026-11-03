const fs = require('fs');
const path = require('path');
const os = require('os');
const XLSX = require(path.resolve(__dirname, '../../web/node_modules/xlsx'));

const excelPath = 'C:/Users/kumar/Downloads/amora_bakes_stock_import_invoice_added.xlsx';
const downloadsDir = 'd:/restorent/apps/downloads';
const allDownloadFolders = fs.readdirSync(downloadsDir).filter(f => {
  try {
    return fs.statSync(path.join(downloadsDir, f)).isDirectory();
  } catch (_) { return false; }
});

const targetUploadDirs = [
  path.resolve(__dirname, '../uploads'),
  path.resolve(__dirname, '../../web/public/uploads'),
  path.resolve(__dirname, '../../web/dist/uploads'),
  path.join(os.homedir(), 'AppData', 'Roaming', 'restaurant-saas-electron', 'uploads'),
];

for (const dir of targetUploadDirs) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Generate valid EAN-13 check digit
function calcEan13CheckDigit(first12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(first12[i], 10);
    sum += (i % 2 === 0) ? digit : digit * 3;
  }
  const rem = sum % 10;
  return rem === 0 ? 0 : 10 - rem;
}

function makeEan13(counter) {
  const base = `8908000${String(counter).padStart(5, '0')}`;
  const check = calcEan13CheckDigit(base);
  return `${base}${check}`;
}

// Normalized token helper
function norm(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function toTokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean);
}

// Explicit mappings for items that need exact directory resolution
const explicitFolderMap = {
  'pudding cake carrot': 'pudding_cake_carrot',
  'pudding cake dates': 'pudding_cake_dates',
  'pudding cake jackfruit': 'pudding_cake_jackfruit',
  'pudding cake banana': 'pudding_cake_banana',
  'lotte gift jewel 8': 'lotte_gift_jewel_8',
  'lotte gift orange': 'lotte_gift_orange',
  'lotte gift milk 13': 'lotte_gift_milk_13',
  'lotte gift honey 1': 'lotte_gift_honey_1',
  'lotte orange 100rs': 'lotte_orange_100rs',
  'lotte 10rs jellies': 'lotte_10rs_jellies',
  'lotte chocopie 18pc': 'lotte_chocopie_18pc',
  'lotte chocopie 6pcs': 'lotte_chocopie_6pcs',
  'lotte choco pie 4pcs': 'lotte_choco_pie_4pcs',
  'lotte choco pie 2pcs': 'lotte_choco_pie_2pcs',
  'elite brownie furi': 'elite_brownie_furi',
  'elite brownie cake': 'elite_brownie_cake',
  'marble cake 140gm': 'marble_cake_choco_vanilla_122gm_40pk',
  'black raisin cake': 'black_raisin_cake',
  'bar cake chocolate': 'bar_cake_chocolate',
  'bar cake fruit 140gm': 'bar_cake_fruit_140gm',
  'bar cake orange': 'bar_cake_orange',
  'bar cake pineapple': 'bar_cake_pineapple',
  'bar cake vanilla': 'bar_cake_vanilla',
  '6 in one choco cake': '6_in_one_choco_cake',
  '4 in one choco cake': '4_in_one_choco_cake',
  'rusk classic 135gm': 'rusk_classic_135gm',
  'rusk classic 405gm': 'rusk_classic_405gm',
  'rusk elachi 182gm': 'rusk_elachi_182gm',
  'rusk milk 116gm': 'rusk_milk_116gm',
  'rusk milk 54gm': 'rusk_milk_54gm',
  'rusk milk 300gm': 'rusk_milk_116gm',
  'sb peanut butter 2': 'sb_peanut_butter_2_cont',
  'bournville 70% rich cocoa 75g': 'bournville_70_rich_cocoa_75g',
  'bournville rc 75g carton pack': 'bournville_rc_75g_carton_pack',
  'bournville 70% intense 75g': 'bournville_70_rich_cocoa_75g',
  'bournville rc 75g classic': 'bournville_rc_75g_carton_pack',
  'cadbury silk bubbly 46g rs.100': 'cadbury_fuse_23g_rs_20_nuts',
  'five star 20.2g rs.10': 'cadbury_fuse_23g_rs_20_nuts',
  'perk rs.10 20.6g': 'cadbury_fuse_23g_rs_20_nuts',
  'roshen bonny fruit summer mix 200gm*18': 'roshen_bonny_fruit_citrus_mix_200gm_18',
  'gd butter 34.5gm 180pk': 'gd_butter_250gm_40pk',
  'gd butter 60.1gm 90pk': 'gd_butter_250gm_40pk',
  'gdca 30.2gm 180pk z': 'gd_cashew_120gm_60pk',
  '50-50 200gm 36pk': '50_50_base_63gm_108pk',
  '50-50 28.4+3.1gm (31.5gm) 144pk': '50_50_potazoz_71gm_48pk',
  'marie 32.9gm 168pk': 'marie_gold_200gm_30pk',
  'marie gold 68.9gm 96pk': 'marie_gold_200gm_30pk',
  'marie gold 132.9+29.1gm (162gm) 48pk': 'marie_gold_250gm_36pk',
  'milk bikis 59.9gm 120pk': 'milk_bikis_150gm_56pk',
  'milk bikis classic 57.1gm 120pk': 'milk_bikis_150gm_56pk',
  'cb centrefield cookie 69g': 'vintage_chocolate_chips_cookies_400gm_12',
  'milkshake combo 180ml': 'cool_coffee_caremal_180ml',
};

function getFolderForName(name) {
  const clean = name.trim().toLowerCase();
  if (explicitFolderMap[clean]) return explicitFolderMap[clean];

  // Try direct normalized match
  const n = norm(clean);
  let match = allDownloadFolders.find(f => norm(f) === n);
  if (match) return match;

  // Try startsWith / endsWith
  match = allDownloadFolders.find(f => {
    const fn = norm(f);
    return fn.startsWith(n) || n.startsWith(fn);
  });
  if (match) return match;

  // Token scoring
  const itemTokens = toTokens(clean);
  let best = null;
  let maxScore = 0;
  for (const f of allDownloadFolders) {
    const fTokens = toTokens(f);
    let s = 0;
    for (const t of itemTokens) {
      if (fTokens.includes(t)) s += 2;
    }
    if (s > maxScore) {
      maxScore = s;
      best = f;
    }
  }
  return best;
}

function pickCandidateImage(folderName) {
  if (!folderName) return null;
  const folderPath = path.join(downloadsDir, folderName);
  if (!fs.existsSync(folderPath)) return null;

  const files = fs.readdirSync(folderPath);
  // Prioritize candidate_2.* then candidate_1.* then candidate_3.*
  const cand2 = files.find(f => f.startsWith('candidate_2.'));
  if (cand2) return path.join(folderPath, cand2);
  const cand1 = files.find(f => f.startsWith('candidate_1.'));
  if (cand1) return path.join(folderPath, cand1);
  const cand3 = files.find(f => f.startsWith('candidate_3.'));
  if (cand3) return path.join(folderPath, cand3);
  const anyImg = files.find(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
  if (anyImg) return path.join(folderPath, anyImg);
  return null;
}

// Read Excel
console.log('📖 Reading Excel:', excelPath);
const wb = XLSX.readFile(excelPath);
const nonKotRows = XLSX.utils.sheet_to_json(wb.Sheets['Non KOT Items'], { defval: '' });
const invoiceRows = XLSX.utils.sheet_to_json(wb.Sheets['Invoice Calculation'], { defval: '' });

// Check missing invoice items and append them to Non-KOT list
const nonKotNames = new Set(nonKotRows.map(r => r.SignatureName.trim().toLowerCase()));
const extraInvoiceItems = [
  {
    name: 'Bournville 70% Rich Cocoa 75g',
    mrp: 150,
    cost: 127.55,
    price: 150,
    qty: 6,
    category: 'Chocolates & Confectionery',
    unit: 'Piece (pc)',
    group: 'Non KOT',
    tax: 5
  },
  {
    name: 'Bournville RC 75g Carton Pack',
    mrp: 135,
    cost: 114.8,
    price: 135,
    qty: 6,
    category: 'Chocolates & Confectionery',
    unit: 'Piece (pc)',
    group: 'Non KOT',
    tax: 5
  },
  {
    name: 'Milkshake Combo 180ml',
    mrp: 40,
    cost: 32,
    price: 40,
    qty: 24,
    category: 'Beverages',
    unit: 'Piece (pc)',
    group: 'Non KOT',
    tax: 5
  }
];

for (const extra of extraInvoiceItems) {
  if (!nonKotNames.has(extra.name.toLowerCase())) {
    console.log(`➕ Adding missing invoice item: ${extra.name}`);
    nonKotRows.push({
      ProductQR: '',
      SignatureName: extra.name,
      MRP: extra.mrp,
      PurchaseRate: extra.cost,
      ProfitPercent: Math.round(((extra.price - extra.cost) / extra.cost) * 100 * 100) / 100,
      SellingPrice: extra.price,
      SalesUnit: extra.unit,
      Qty: extra.qty,
      Category: extra.category,
      Group: extra.group,
      AssignedMenu: 'General Menu',
      StockWarn: 5,
      ExpiryDate: '',
      TaxType: 'include',
      TaxPercent: extra.tax,
      EnablePackOptions: 'false',
      PackVariants: '',
      ImageMode: 'lib'
    });
    nonKotNames.add(extra.name.toLowerCase());
  }
}

// Deduplicate Kokao Bullet and merge exact identical duplicates
const mergedRows = [];
const seen = new Map();

for (const row of nonKotRows) {
  const key = `${row.SignatureName.trim().toLowerCase()}__${row.ProductQR.trim()}`;
  if (seen.has(key)) {
    const existing = seen.get(key);
    existing.Qty = (Number(existing.Qty) || 0) + (Number(row.Qty) || 0);
  } else {
    seen.set(key, row);
    mergedRows.push(row);
  }
}

// Generate Barcodes for any row with blank ProductQR
let barcodeCounter = 1;
const usedBarcodes = new Set();
mergedRows.forEach(r => {
  if (r.ProductQR && r.ProductQR.trim()) {
    usedBarcodes.add(r.ProductQR.trim());
  }
});

for (const row of mergedRows) {
  // If barcode is empty, generate EAN-13
  if (!row.ProductQR || String(row.ProductQR).trim() === '') {
    while (usedBarcodes.has(makeEan13(barcodeCounter))) {
      barcodeCounter++;
    }
    const newBarcode = makeEan13(barcodeCounter);
    row.ProductQR = newBarcode;
    usedBarcodes.add(newBarcode);
    barcodeCounter++;
  }

  // If purchase rate is missing or 0, estimate cost as 80% of MRP (20% margin)
  const mrp = Number(row.MRP) || Number(row.SellingPrice) || 10;
  if (!row.PurchaseRate || Number(row.PurchaseRate) === 0) {
    row.PurchaseRate = Math.round(mrp * 0.80 * 100) / 100;
  }
  if (!row.SellingPrice || Number(row.SellingPrice) === 0) {
    row.SellingPrice = mrp;
  }
  if (!row.MRP || Number(row.MRP) === 0) {
    row.MRP = row.SellingPrice;
  }
  const cost = Number(row.PurchaseRate);
  const sp = Number(row.SellingPrice);
  row.ProfitPercent = cost > 0 ? Math.round(((sp - cost) / cost) * 100 * 100) / 100 : 25;
}

// Disambiguate duplicate Kokao Bullet 1kg with same barcode
const kokaoItems = mergedRows.filter(r => r.SignatureName.includes('Kokao Bullet 1kg'));
if (kokaoItems.length > 1) {
  kokaoItems[1].ProductQR = `${kokaoItems[1].ProductQR}_1`;
}

// Now copy images and build JSON products array
const finalProducts = [];
let imgCopiedCount = 0;

mergedRows.forEach((row, idx) => {
  const qr = String(row.ProductQR).trim();
  const name = String(row.SignatureName).trim();
  const folder = getFolderForName(name);
  const candidateSrc = pickCandidateImage(folder);

  let ext = '.jpg';
  if (candidateSrc) {
    ext = path.extname(candidateSrc).toLowerCase() || '.jpg';
  }

  const targetFileName = `amora_${qr}${ext}`;
  const webPath = `/uploads/${targetFileName}`;

  if (candidateSrc && fs.existsSync(candidateSrc)) {
    for (const destDir of targetUploadDirs) {
      const destPath = path.join(destDir, targetFileName);
      try {
        fs.copyFileSync(candidateSrc, destPath);
      } catch (_) {}
    }
    imgCopiedCount++;
  } else {
    // If no candidate, create SVG placeholder
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="100%" height="100%" fill="#1a1f2e"/><text x="50%" y="45%" font-size="20" font-weight="bold" fill="#3b82f6" text-anchor="middle">${name.substring(0, 24)}</text><text x="50%" y="60%" font-size="14" fill="#94a3b8" text-anchor="middle">Amora Bakes</text></svg>`;
    for (const destDir of targetUploadDirs) {
      fs.writeFileSync(path.join(destDir, `amora_${qr}.svg`), svg);
    }
  }

  finalProducts.push({
    id: idx + 1,
    productQR: qr,
    name: name,
    mrp: Number(row.MRP) || Number(row.SellingPrice) || 0,
    purchaseRate: Number(row.PurchaseRate) || 0,
    profitPercent: Number(row.ProfitPercent) || 0,
    sellingPrice: Number(row.SellingPrice) || 0,
    salesUnit: row.SalesUnit || 'Piece (pc)',
    qty: Number(row.Qty) || 0,
    category: row.Category || 'General',
    group: 'Non KOT',
    assignedMenu: row.AssignedMenu || 'General Menu',
    stockWarn: Number(row.StockWarn) || 5,
    taxType: row.TaxType || 'include',
    taxPercent: Number(row.TaxPercent) || 5,
    image: candidateSrc ? webPath : `/uploads/amora_${qr}.svg`,
    isKOTEnabled: false
  });
});

console.log(`✅ Built ${finalProducts.length} Non-KOT items.`);
console.log(`📸 Copied images for ${imgCopiedCount} / ${finalProducts.length} items.`);

// Write back to amora-non-kot-products.json
const jsonPath = path.resolve(__dirname, '../prisma/amora-non-kot-products.json');
fs.writeFileSync(jsonPath, JSON.stringify(finalProducts, null, 2), 'utf8');
console.log(`💾 Saved updated JSON seed to: ${jsonPath}`);

// Write back updated rows to Excel so Excel values are also 100% complete!
console.log('📝 Updating Excel file with all completed values...');
const newWs = XLSX.utils.json_to_sheet(mergedRows);
wb.Sheets['Non KOT Items'] = newWs;
XLSX.writeFile(wb, excelPath);
console.log(`💾 Updated Excel file at: ${excelPath}`);
