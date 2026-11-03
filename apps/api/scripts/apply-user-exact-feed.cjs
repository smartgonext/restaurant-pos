const fs = require('fs');
const path = require('path');
const os = require('os');
const XLSX = require(path.resolve(__dirname, '../../web/node_modules/xlsx'));

const excelPath = 'C:/Users/kumar/Downloads/amora_bakes_stock_import_invoice_added.xlsx';
const downloadsDir = 'd:/restorent/apps/downloads';
const allDownloadFolders = fs.readdirSync(downloadsDir).filter(f => {
  try { return fs.statSync(path.join(downloadsDir, f)).isDirectory(); } catch (_) { return false; }
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

function norm(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function toTokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean);
}

// Read user's exact feed list
const userLines = fs.readFileSync('api/scripts/user-exact-barcodes.tsv', 'utf8').split('\n').filter(Boolean);
const userFeed = [];
for (const line of userLines) {
  const parts = line.split('\t');
  const qr = (parts[0] || '').trim();
  const name = parts.slice(1).join('\t').trim();
  if (name) {
    userFeed.push({ qr, name });
  }
}
console.log(`Parsed ${userFeed.length} items from user exact barcode feed.`);

// Explicit folder map to guarantee perfect image matching for all items
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
  // New items
  'msk butter 170ml': 'msk_butter_170ml',
  'msk choco 180ml': 'msk_choco_180ml',
  'msk strawberry 180ml': 'msk_strawberry_180ml',
  'msk vanilla 170ml': 'msk_vanilla_170ml',
  '3roses h&s (p) 2x500g relaunch': 'so_best_h_s_p_2x500g_relaunch',
  '3roses ts (p) 1kg 2x500g (rinch)': 'so_best_h_s_p_1kg_2x500g_rinch',
  'boost 10g sachet': 'std_hlx_17g_sachet_pl_sf_strp',
  'boost 180ml tetrapack classic': 'std_hlx_icon_jar_200g_pl_sf',
  'std. hlx icon jar 200g': 'std_hlx_icon_jar_200g_pl_sf',
  'std. hlx icon jar 500gm': 'std_hlx_icon_jar_500gm',
  'bru super strong tripti 200g poly rl': 'kissan_super_strong_tripti_200g_poly_rl',
  'pri. urad kesar badam stg': 'pri_urad_kesar_badam_stg',
  'hlx plain biscuit 150g': 'tiger_plain_biscuit_150g',
  'hlx plain biscuit 300g': 'tiger_plain_biscuit_300g',
  'kissan fresh tomato ketchup 500g': 'kissan_fresh_tomato_ketchup_500g',
  'kissan fresh tomato ketchup 200g': 'kissan_fresh_tomato_ketchup_200g',
  'kissan mix fruit jam 500gm f np': 'kissan_mix_fruit_jam_500gm_f_np',
  'kissan mix fruit jam 200gm f np': 'kissan_mix_fruit_jam_500gm_f_np',
  'kissan peanut butter 100 gm nf': 'kissan_peanut_butter_100_gm_nf',
  'kissan peanut butter 350 gm nsl': 'kissan_peanut_butter_350_gm_nsl',
  'kissan peanut butter crunchy 100 gm': 'kissan_peanut_butter_crunchy_100_gm',
  'kissan peanut butter crunchy 350 gm nf': 'kissan_peanut_butter_350_gm_nsl',
  'kissan sweet & spicy sauce 200g': 'kissan_sweet_spicy_sauce_200g',
  'kissan tomato chilli sauce 500g': 'kissan_tomato_chilli_sauce_500g',
  'ksn me jam tub 90g f kp 25*': 'ksn_me_jam_tub_90g_f_kp_25',
  'ksn mxd frt jam 200g rl f np': 'ksn_mxd_frt_jam_200g_rl_f_np',
  'lipton green clear &light 1.3gx25s tb': 'lipton_green_clear_light_1_3gx25s_tb',
  'lipton green honey lemon 25stb 35gslf': 'lipton_green_clear_light_1_3gx25s_tb',
  'std hlx 17g sachet pl+sf strp': 'std_hlx_17g_sachet_pl_sf_strp',
  'std. hlx icon jar 200g pl+sf': 'std_hlx_icon_jar_200g_pl_sf',
  'std. horlicks icon jar 1kg pl': 'std_horlicks_icon_jar_1kg_pl',
  'std. horlicks icon jar 500g pl+sf': 'std_horlicks_icon_jar_500g_pl_sf',
};

function getFolderForName(name) {
  const clean = name.trim().toLowerCase();
  if (explicitFolderMap[clean]) return explicitFolderMap[clean];

  const n = norm(clean);
  let match = allDownloadFolders.find(f => norm(f) === n);
  if (match) return match;

  match = allDownloadFolders.find(f => {
    const fn = norm(f);
    return fn.startsWith(n) || n.startsWith(fn);
  });
  if (match) return match;

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

// Read current amora-non-kot-products.json as base
const amoraProducts = JSON.parse(fs.readFileSync('api/prisma/amora-non-kot-products.json', 'utf8'));

// Build quick lookup map by normalized name
const productsByNormName = new Map();
amoraProducts.forEach(p => {
  productsByNormName.set(norm(p.name), p);
});

// Update barcodes from user exact feed
const usedQRs = new Set();
let updatedBarcodesCount = 0;

userFeed.forEach(u => {
  const n = norm(u.name);
  const existing = productsByNormName.get(n);
  if (existing) {
    if (u.qr) {
      let finalQR = u.qr;
      if (usedQRs.has(finalQR)) {
        finalQR = `${finalQR}_1`;
      }
      usedQRs.add(finalQR);
      if (existing.productQR !== finalQR) {
        existing.productQR = finalQR;
        updatedBarcodesCount++;
      }
    }
  }
});
console.log(`Updated ${updatedBarcodesCount} barcodes to user's exact feed.`);

// Defaults for new products
const newProductDefaults = {
  'MSK Butter 170ml': { mrp: 35, cost: 28, price: 35, qty: 12, cat: 'Beverages' },
  'MSK Choco 180ml': { mrp: 40, cost: 32, price: 40, qty: 12, cat: 'Beverages' },
  'MSK Strawberry 180ml': { mrp: 40, cost: 32, price: 40, qty: 12, cat: 'Beverages' },
  'MSK Vanilla 170ml': { mrp: 35, cost: 28, price: 35, qty: 12, cat: 'Beverages' },
  '3ROSES H&S (P) 2X500G RELAUNCH': { mrp: 450, cost: 390, price: 450, qty: 6, cat: 'Beverages' },
  '3ROSES TS (P) 1KG 2X500G (RINCH)': { mrp: 450, cost: 390, price: 450, qty: 6, cat: 'Beverages' },
  'boost 10g SACHET': { mrp: 5, cost: 4, price: 5, qty: 48, cat: 'Beverages' },
  'BOOST 180ML TETRAPACK CLASSIC': { mrp: 35, cost: 28, price: 35, qty: 24, cat: 'Beverages' },
  'STD. HLX ICON JAR 200G': { mrp: 130, cost: 110, price: 130, qty: 12, cat: 'Beverages' },
  'STD. HLX ICON JAR 500GM': { mrp: 280, cost: 240, price: 280, qty: 6, cat: 'Beverages' },
  'BRU SUPER STRONG TRIPTI 200G POLY RL': { mrp: 120, cost: 100, price: 120, qty: 12, cat: 'Beverages' },
  'PRI. URAD KESAR BADAM STG': { mrp: 150, cost: 125, price: 150, qty: 8, cat: 'Beverages' },
  'HLX PLAIN BISCUIT 150G': { mrp: 30, cost: 25, price: 30, qty: 24, cat: 'Biscuits & Cookies' },
  'HLX PLAIN BISCUIT 300G': { mrp: 60, cost: 50, price: 60, qty: 12, cat: 'Biscuits & Cookies' },
  'KISSAN FRESH TOMATO KETCHUP 500G': { mrp: 120, cost: 100, price: 120, qty: 12, cat: 'Spreads & Grocery' },
  'KISSAN FRESH TOMATO KETCHUP 200G': { mrp: 55, cost: 45, price: 55, qty: 24, cat: 'Spreads & Grocery' },
  'KISSAN MIX FRUIT JAM 500GM F NP': { mrp: 165, cost: 140, price: 165, qty: 12, cat: 'Jams & Spreads' },
  'KISSAN MIX FRUIT JAM 200GM F NP': { mrp: 80, cost: 68, price: 80, qty: 18, cat: 'Jams & Spreads' },
  'KISSAN PEANUT BUTTER 100 GM NF': { mrp: 75, cost: 60, price: 75, qty: 12, cat: 'Spreads & Grocery' },
  'KISSAN PEANUT BUTTER 350 GM NSL': { mrp: 180, cost: 150, price: 180, qty: 6, cat: 'Spreads & Grocery' },
  'KISSAN PEANUT BUTTER CRUNCHY 100 GM': { mrp: 75, cost: 60, price: 75, qty: 12, cat: 'Spreads & Grocery' },
  'KISSAN PEANUT BUTTER CRUNCHY 350 GM NF': { mrp: 180, cost: 150, price: 180, qty: 6, cat: 'Spreads & Grocery' },
  'KISSAN SWEET & SPICY SAUCE 200G': { mrp: 65, cost: 55, price: 65, qty: 12, cat: 'Spreads & Grocery' },
  'KISSAN TOMATO CHILLI SAUCE 500G': { mrp: 130, cost: 110, price: 130, qty: 12, cat: 'Spreads & Grocery' },
  'KSN ME JAM TUB 90G F KP 25*': { mrp: 40, cost: 34, price: 40, qty: 24, cat: 'Jams & Spreads' },
  'KSN MXD FRT JAM 200G RL F NP': { mrp: 75, cost: 62, price: 75, qty: 18, cat: 'Jams & Spreads' },
  'LIPTON GREEN CLEAR &LIGHT 1.3GX25S TB': { mrp: 165, cost: 140, price: 165, qty: 12, cat: 'Beverages' },
  'LIPTON GREEN HONEY LEMON 25STB 35GSLF': { mrp: 180, cost: 150, price: 180, qty: 12, cat: 'Beverages' },
  'STD HLX 17G SACHET PL+SF STRP': { mrp: 10, cost: 8, price: 10, qty: 36, cat: 'Beverages' },
  'STD. HLX ICON JAR 200G PL+SF': { mrp: 130, cost: 110, price: 130, qty: 12, cat: 'Beverages' },
  'STD. HORLICKS ICON JAR 1KG PL': { mrp: 520, cost: 440, price: 520, qty: 6, cat: 'Beverages' },
  'STD. HORLICKS ICON JAR 500G PL+SF': { mrp: 280, cost: 240, price: 280, qty: 6, cat: 'Beverages' }
};

// Add new items not yet in seed
let addedCount = 0;
userFeed.forEach(u => {
  const n = norm(u.name);
  if (!productsByNormName.has(n)) {
    const d = newProductDefaults[u.name] || { mrp: 50, cost: 40, price: 50, qty: 10, cat: 'General' };
    let finalQR = u.qr || `8908${String(Date.now()).slice(-9)}`;
    if (usedQRs.has(finalQR)) finalQR = `${finalQR}_1`;
    usedQRs.add(finalQR);

    const newItem = {
      id: amoraProducts.length + addedCount + 1,
      productQR: finalQR,
      name: u.name,
      mrp: d.mrp,
      purchaseRate: d.cost,
      profitPercent: Math.round(((d.price - d.cost) / d.cost) * 100 * 100) / 100,
      sellingPrice: d.price,
      salesUnit: 'Piece (pc)',
      qty: d.qty,
      category: d.cat,
      group: 'Non KOT',
      assignedMenu: 'General Menu',
      stockWarn: 5,
      taxType: 'include',
      taxPercent: 5,
      image: '',
      isKOTEnabled: false
    };

    productsByNormName.set(n, newItem);
    amoraProducts.push(newItem);
    addedCount++;
  }
});
console.log(`Added ${addedCount} brand new items into seed.`);

// Refresh images and copy to all target upload directories
let copiedImages = 0;
for (const p of amoraProducts) {
  const folder = getFolderForName(p.name);
  const candImg = pickCandidateImage(folder);
  const ext = candImg ? (path.extname(candImg).toLowerCase() || '.jpg') : '.jpg';
  const targetFileName = `amora_${p.productQR}${ext}`;
  const webPath = `/uploads/${targetFileName}`;

  if (candImg && fs.existsSync(candImg)) {
    for (const dir of targetUploadDirs) {
      try {
        fs.copyFileSync(candImg, path.join(dir, targetFileName));
      } catch (_) {}
    }
    p.image = webPath;
    copiedImages++;
  } else {
    // If no candidate, keep existing or generate SVG
    if (!p.image || p.image.endsWith('.svg')) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="100%" height="100%" fill="#1a1f2e"/><text x="50%" y="45%" font-size="20" font-weight="bold" fill="#3b82f6" text-anchor="middle">${p.name.substring(0, 24)}</text><text x="50%" y="60%" font-size="14" fill="#94a3b8" text-anchor="middle">Amora Bakes</text></svg>`;
      const svgName = `amora_${p.productQR}.svg`;
      for (const dir of targetUploadDirs) {
        fs.writeFileSync(path.join(dir, svgName), svg);
      }
      p.image = `/uploads/${svgName}`;
    }
  }
}

console.log(`✅ Final total Non-KOT products: ${amoraProducts.length}`);
console.log(`📸 Successfully mapped and copied images for: ${copiedImages} / ${amoraProducts.length}`);

// Save amora-non-kot-products.json
fs.writeFileSync('api/prisma/amora-non-kot-products.json', JSON.stringify(amoraProducts, null, 2), 'utf8');
console.log('💾 Saved api/prisma/amora-non-kot-products.json');

// Write back all updated rows to Excel so Excel matches 100%
const excelRows = amoraProducts.map(p => ({
  ProductQR: p.productQR,
  SignatureName: p.name,
  MRP: p.mrp,
  PurchaseRate: p.purchaseRate,
  ProfitPercent: p.profitPercent,
  SellingPrice: p.sellingPrice,
  SalesUnit: p.salesUnit,
  Qty: p.qty,
  Category: p.category,
  Group: p.group,
  AssignedMenu: p.assignedMenu,
  StockWarn: p.stockWarn,
  ExpiryDate: '',
  TaxType: p.taxType,
  TaxPercent: p.taxPercent,
  EnablePackOptions: 'false',
  PackVariants: '',
  ImageMode: 'lib'
}));

const wb = XLSX.readFile(excelPath);
wb.Sheets['Non KOT Items'] = XLSX.utils.json_to_sheet(excelRows);
XLSX.writeFile(wb, excelPath);
console.log(`💾 Excel file updated with ${excelRows.length} items at: ${excelPath}`);

