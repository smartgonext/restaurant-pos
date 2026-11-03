const fs = require('fs');
const path = require('path');
const os = require('os');
const XLSX = require('xlsx');

const excelPath = 'c:/Users/kumar/Downloads/amora_bakes_stock_import_invoice_added.xlsx';
const dlBase = 'd:/restorent/apps/downloads';

console.log('Loading Excel from:', excelPath);
const wb = XLSX.readFile(excelPath);
const rawItems = XLSX.utils.sheet_to_json(wb.Sheets['Non KOT Items']);
console.log(`Loaded ${rawItems.length} rows from 'Non KOT Items'.`);

// Upload target directories
const uploadDirs = [
  path.resolve(__dirname, '../uploads'),
  path.resolve(__dirname, '../../web/public/uploads'),
  path.resolve(__dirname, '../../web/dist/uploads'),
  path.join(os.homedir(), 'AppData', 'Roaming', 'restaurant-saas-electron', 'uploads'),
];

uploadDirs.forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// Load folders in downloads
const dlFolders = fs.readdirSync(dlBase).filter(f => fs.statSync(path.join(dlBase, f)).isDirectory());

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\+/g, '_')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

// Map each folder -> candidate_2 or candidate_1 or any image
const folderMap = new Map();
dlFolders.forEach(f => {
  const dir = path.join(dlBase, f);
  const files = fs.readdirSync(dir);
  const cand2 = files.find(file => file.startsWith('candidate_2.'));
  const cand1 = files.find(file => file.startsWith('candidate_1.'));
  const candAny = files.find(file => /\.(jpg|jpeg|png|webp)$/i.test(file));
  const chosen = cand2 || cand1 || candAny || null;
  if (chosen) {
    folderMap.set(norm(f), path.join(dir, chosen));
  }
});

// Explicit fallbacks for specific items whose names/folders have minor differences
const specificFallbacks = {
  'mm_nimbu_fresh_tetra_150ml': 'mm_nimbu_fresh_250ml',
  'glucovita_lemon_180ml': 'glucovita_orange_180ml',
  'windfire_hello_sweetheart_jelly_100gm_30': 'vellfire_bloom_marshmallow_120gm_60',
  'mojoie_truffle_foil_round_350gm_assorted': 'mojoie_truffles_280gm_12',
  'vfoods_mr_bee_banana_50gm_48': 'vfoods_dear_teddy_bisc_coconut_150g',
  'dry_apricots_200gm_35': 'star_dry_fruits_nuts_350gm',
  'gd_butter_34_5gm_180pk': 'gd_butter_250gm_40pk',
  'gd_butter_60_1gm_90pk': 'gd_butter_250gm_40pk',
  'gd_chocochips_33gm_72pk': 'gd_cashew_250gm_40pk',
  'gdca_30_2gm_180pk_z': 'gd_cashew_250gm_40pk',
  '50_50_200gm_36pk': '50_50_base_63gm_108pk',
  '50_50_28_4_3_1gm_31_5gm_144pk': '50_50_base_63gm_108pk',
  'marie_32_9gm_168pk': 'marie_gold_200gm_30pk',
  'marie_gold_68_9gm_96pk': 'marie_gold_200gm_30pk',
  'marie_gold_132_9_29_1gm_162gm_48pk': 'marie_gold_200gm_30pk',
  'milk_bikis_34gm_210pk': 'milk_bikis_150gm_56pk',
  'milk_bikis_59_9gm_120pk': 'milk_bikis_150gm_56pk',
  'milk_bikis_classic_57_1gm_120pk': 'milk_bikis_150gm_56pk',
  'bournville_70_intense_75g': 'bournville_70_rich_cocoa_75g',
  'bournville_rc_75g_classic': 'bournville_rc_75g_carton_pack',
  'cb_centrefield_cookie_69g': 'pm_chococlush_69gm_60pk',
  'cadbury_silk_bubbly_46g_rs_100': 'cadbury_dairy_milk_44g_rs_45',
  'cadbury_silk_fruit_nut_51g_rs_100': 'bournville_fruit_nut_75g',
  'cadbury_silk_ganache_54g_rs_100': 'cadbury_dairy_milk_44g_rs_45',
  'cadbury_silk_hazelnut_54g_rs_100': 'cadbury_fuse_23g_rs_20_nuts',
  'cadbury_silk_mousse_48_5g_rs_100': 'cadbury_dairy_milk_44g_rs_45',
  'cadbury_silk_oreo_124g_rs_215': 'cadbury_dairy_milk_44g_rs_45',
  'cadbury_silk_oreo_58_5g_rs_100': 'cadbury_dairy_milk_20_2g_rs_20',
  'cadbury_silk_plain_55g_rs_90': 'cadbury_dairy_milk_44g_rs_45',
  'cadbury_silk_roast_almond_52g_rs_100': 'cadbury_fuse_23g_rs_20_nuts',
  'five_star_20_2g_rs_10': 'cadbury_fuse_23g_rs_20_nuts',
  'five_star_9_8g_x_54_flowpack': 'cadbury_dairy_milk_6_1g_x_72_rs_5',
  'oreo_choco_41_75g_rs_10': 'treat_jim_jam_92gm_75pk',
  'oreo_original_41_75g_rs_10': 'treat_jim_jam_92gm_75pk',
  'perk_rs_10_20_6g': 'kaprika_wafers_chocolate_120gm_60',
  'pri_oreo_choco_116_9g_rs_30': 'treat_jim_jam_92gm_75pk',
  'pri_oreo_original_116_9g_rs_30': 'treat_jim_jam_92gm_75pk',
  'rusk_milk_300gm': 'rusk_milk_116gm',
  'marble_cake_140gm': 'bar_cake_fruit_140gm',
  'sb_peanut_butter_2': 'sb_peanut_butter_2_cont',
  'chocobakes_chocolate_chip_cookies': 'vintage_chocolate_chips_cookies_400gm_12',
  'livinda_medelin_milk_2kg_8': 'livinda_medelin_pista_2kg_8'
};

function resolveImageFile(name) {
  const n = norm(name);
  if (folderMap.has(n)) return folderMap.get(n);
  if (specificFallbacks[n] && folderMap.has(specificFallbacks[n])) {
    return folderMap.get(specificFallbacks[n]);
  }
  // Substring match
  for (const [fn, fpath] of folderMap.entries()) {
    if (fn.startsWith(n) || n.startsWith(fn)) return fpath;
  }
  // Token match
  const tokens = n.split('_').filter(t => t.length > 2);
  let bestScore = 0;
  let bestPath = null;
  for (const [fn, fpath] of folderMap.entries()) {
    const fTokens = fn.split('_');
    let c = 0;
    tokens.forEach(t => { if (fTokens.includes(t)) c++; });
    const score = c / Math.max(tokens.length, fTokens.length);
    if (score > 0.4 && score > bestScore) {
      bestScore = score;
      bestPath = fpath;
    }
  }
  return bestPath;
}

// Generate valid standard EAN-13 check digit
function makeEan13(prefix12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = parseInt(prefix12[i], 10);
    sum += d * (i % 2 === 0 ? 1 : 3);
  }
  const rem = sum % 10;
  const check = rem === 0 ? 0 : 10 - rem;
  return `${prefix12}${check}`;
}

// Track generated EAN-13 counter for empty barcode items
let eanCounter = 1;

// Existing products map for fallback
const existingJson = require('../prisma/amora-non-kot-products.json');
const existingMap = new Map();
existingJson.forEach(p => existingMap.set(p.productQR, p));

const processedProducts = [];
const seenBarcodes = new Map();

rawItems.forEach((r, idx) => {
  let qr = String(r.ProductQR || '').trim();
  const name = String(r.SignatureName || '').trim();
  const mrp = Number(r.MRP || r.SellingPrice || 0);
  const purchaseRate = Number(r.PurchaseRate || 0);
  const profitPercent = Number(r.ProfitPercent || 0);
  const sellingPrice = Number(r.SellingPrice || r.MRP || mrp || 0);
  const qty = Number(r.Qty || 1);
  const category = String(r.Category || 'General').trim();
  const stockWarn = Number(r.StockWarn || 5);
  const taxType = String(r.TaxType || 'include').toLowerCase();
  const taxPercent = Number(r.TaxPercent || 0);
  const salesUnit = String(r.SalesUnit || 'Piece (pc)').trim();

  // Handle Kokao Bullet
  if (name === 'Kokao Bullet 1kg') {
    qr = '8950600060787_1';
  }

  // Handle empty QR
  if (!qr) {
    const base12 = `8908${String(eanCounter).padStart(8, '0')}`;
    qr = makeEan13(base12);
    eanCounter++;
  }

  // Check if identical duplicate in Excel (e.g. Kokao Snack Bar, Dolphin, Windfire)
  if (seenBarcodes.has(qr)) {
    const prev = seenBarcodes.get(qr);
    if (prev.name.toLowerCase() === name.toLowerCase()) {
      // Merge quantity
      prev.qty = (prev.qty || 0) + qty;
      console.log(`Merged duplicate row for '${name}' (Barcode: ${qr}, Total Qty: ${prev.qty})`);
      return;
    } else {
      // Disambiguate if different name
      qr = `${qr}_${idx + 1}`;
    }
  }

  // Resolve Image
  let srcFile = resolveImageFile(name);
  let ext = '.jpg';
  if (srcFile) {
    ext = path.extname(srcFile) || '.jpg';
  } else if (existingMap.has(qr)) {
    const oldImg = existingMap.get(qr).image;
    ext = path.extname(oldImg) || '.jpg';
  }

  const destFileName = `amora_${qr}${ext}`;
  const relativeImageUrl = `/uploads/${destFileName}`;

  if (srcFile && fs.existsSync(srcFile)) {
    uploadDirs.forEach(dir => {
      try {
        fs.copyFileSync(srcFile, path.join(dir, destFileName));
      } catch (e) {}
    });
  }

  const itemObj = {
    id: processedProducts.length + 1,
    productQR: qr,
    name: name,
    mrp: mrp,
    purchaseRate: purchaseRate,
    profitPercent: profitPercent,
    sellingPrice: sellingPrice,
    salesUnit: salesUnit,
    qty: qty,
    category: category,
    group: 'Non KOT',
    assignedMenu: 'General Menu',
    stockWarn: stockWarn,
    taxType: taxType,
    taxPercent: taxPercent,
    image: relativeImageUrl,
    isKOTEnabled: false
  };

  seenBarcodes.set(qr, itemObj);
  processedProducts.push(itemObj);
});

console.log(`\n===============================================================`);
console.log(`✅ Processed ${processedProducts.length} unique Non-KOT items from Excel!`);
console.log(`===============================================================`);

const jsonOutputPath = path.resolve(__dirname, '../prisma/amora-non-kot-products.json');
fs.writeFileSync(jsonOutputPath, JSON.stringify(processedProducts, null, 2), 'utf-8');
console.log(`Saved updated products to: ${jsonOutputPath} (${fs.statSync(jsonOutputPath).size} bytes)`);

