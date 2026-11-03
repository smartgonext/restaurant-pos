const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const excelPath = 'c:/Users/kumar/Downloads/amora_bakes_stock_import_with_invoice_items.xlsx';
const dlBase = 'd:/restorent/apps/downloads';

const apiUploadsDir = path.resolve(__dirname, '../uploads');
const webPublicUploadsDir = path.resolve(__dirname, '../../web/public/uploads');
const webDistUploadsDir = path.resolve(__dirname, '../../web/dist/uploads');

[apiUploadsDir, webPublicUploadsDir, webDistUploadsDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const wb = xlsx.readFile(excelPath);
const sheet = wb.Sheets['Non KOT Items'];
const rows = xlsx.utils.sheet_to_json(sheet);
console.log(`Loaded ${rows.length} rows from Excel sheet 'Non KOT Items'.`);

const dlFolders = fs.readdirSync(dlBase).filter(f => {
  const full = path.join(dlBase, f);
  return fs.statSync(full).isDirectory();
});

function normalizeFolder(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\+/g, '_')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

// Map each folder -> candidate_2 file, or candidate_1, or any image file
const folderImageMap = new Map();
dlFolders.forEach(f => {
  const dir = path.join(dlBase, f);
  const files = fs.readdirSync(dir);
  const cand2 = files.find(file => file.startsWith('candidate_2.'));
  const cand1 = files.find(file => file.startsWith('candidate_1.'));
  const candAny = files.find(file => /\.(jpg|jpeg|png|webp)$/i.test(file));
  const chosen = cand2 || cand1 || candAny || null;
  if (chosen) {
    folderImageMap.set(f, path.join(dir, chosen));
  }
});

const folderNormMap = new Map();
dlFolders.forEach(f => {
  folderNormMap.set(normalizeFolder(f), f);
});

// Explicit fallbacks for specific items whose folders were empty or slightly different:
const brandFallbacks = {
  'gd_butter_34_5gm_180pk': 'gd_butter_250gm_40pk',
  'gd_butter_60_1gm_90pk': 'gd_butter_250gm_40pk',
  'gd_chocochips_33gm_72pk': 'gd_cashew_250gm_40pk',
  'gdca_30_2gm_180pk_z': 'gd_cashew_250gm_40pk',
  '50_50_28_4_3_1gm_31_5gm_144pk': '50_50_base_63gm_108pk',
  '50_50_200gm_36pk': '50_50_base_63gm_108pk',
  'marie_32_9gm_168pk': 'marie_gold_200gm_30pk',
  'marie_gold_68_9gm_96pk': 'marie_gold_200gm_30pk',
  'marie_gold_132_9_29_1gm_162gm_48pk': 'marie_gold_200gm_30pk',
  'milk_bikis_34gm_210pk': 'milk_bikis_150gm_56pk',
  'milk_bikis_59_9gm_120pk': 'milk_bikis_150gm_56pk',
  'milk_bikis_classic_57_1gm_120pk': 'milk_bikis_150gm_56pk',
  'roshen_bonny_fruit_summer_mix_200gm_18': 'roshen_bonny_fruit_berry_mix_200gm_18',
  'windfire_hello_sweetheart_jelly_100gm_30': 'vellfire_bloom_marshmallow_120gm_60',
  'mojoie_truffle_foil_round_350gm_assorted': 'mojoie_truffles_280gm_12',
  'vfoods_mr_bee_banana_50gm_48': 'vfoods_dear_teddy_bisc_coconut_150g',
  'toy_candy_vbc_plush_bear_10gm_b_15': 'toy_candy_vbc_engineering_vehicle_water',
  'dry_apricots_200gm_35': 'star_dry_fruits_nuts_350gm',
  'cripton_caramel_cream_2kg_8': 'cripton_hazelnut_cream_2kg_8',
  'flemish_sparkling_cocktail_red_750ml_12': 'flemish_sparkling_cocktail_pink_750ml_12',
  'yt_dragees_black_currant_almond_50gm': 'yt_dragees_blueberry_almond_50gm',
  'sugar_free_cappuccino_cookies_100gm_24': 'sugar_free_butter_cookies_100gm_24',
  'dolphin_pudding_ndc_original_yogurt_320gm': 'dolphin_pudding_ndc_apple_yogurt_320gm_24',
  'jele_jelly_cup_blueberry_125gm_6_12': 'jele_jelly_cup_mixed_berry_125gm_6_12',
  'mm_nimbu_fresh_tetra_150ml': 'mm_nimbu_fresh_250ml',
  'glucovita_lemon_180ml': 'glucovita_orange_180ml',
  'cool_coffee_chocolate_180ml': 'cool_coffee_caremal_180ml',
  'cool_coffee_vanilla_180ml': 'cool_coffee_caremal_180ml',
  'star_cashew_with_dates_200gm': 'star_cashew_with_dates_350gm',
  'star_almond_with_dates_200gm': 'star_almond_with_dates_350gm',
  'livinda_medelin_milk_2kg_8': 'livinda_medelin_pista_2kg_8'
};

const processedItems = [];
let copiedCount = 0;

rows.forEach((r, idx) => {
  const name = String(r.SignatureName || '').trim();
  const norm = normalizeFolder(name);
  let srcFile = null;

  // 1. Direct folder match
  const origFolder = folderNormMap.get(norm);
  if (origFolder && folderImageMap.get(origFolder)) {
    srcFile = folderImageMap.get(origFolder);
  }

  // 2. Fallback table
  if (!srcFile && brandFallbacks[norm]) {
    const fb = brandFallbacks[norm];
    if (folderImageMap.get(fb)) {
      srcFile = folderImageMap.get(fb);
    }
  }

  // 3. Substring match
  if (!srcFile) {
    for (const [fn, orig] of folderNormMap.entries()) {
      if ((fn.startsWith(norm) || norm.startsWith(fn)) && folderImageMap.get(orig)) {
        srcFile = folderImageMap.get(orig);
        break;
      }
    }
  }

  // 4. Token overlap
  if (!srcFile) {
    const tokens = norm.split('_').filter(Boolean);
    let bestScore = 0;
    let bestOrig = null;
    for (const [fn, orig] of folderNormMap.entries()) {
      if (!folderImageMap.get(orig)) continue;
      const fTokens = fn.split('_').filter(Boolean);
      let common = 0;
      for (const t of tokens) {
        if (fTokens.includes(t)) common++;
      }
      const score = common / Math.max(tokens.length, fTokens.length);
      if (score > 0.4 && score > bestScore) {
        bestScore = score;
        bestOrig = orig;
      }
    }
    if (bestOrig) {
      srcFile = folderImageMap.get(bestOrig);
    }
  }

  const barcode = String(r.ProductQR || '').trim();
  let ext = '.jpg';
  if (srcFile) {
    ext = path.extname(srcFile) || '.jpg';
  }

  const destFileName = `amora_${barcode || idx + 1}${ext}`;
  const relativeImageUrl = `/uploads/${destFileName}`;

  if (srcFile && fs.existsSync(srcFile)) {
    try {
      const dest1 = path.join(apiUploadsDir, destFileName);
      const dest2 = path.join(webPublicUploadsDir, destFileName);
      const dest3 = path.join(webDistUploadsDir, destFileName);

      fs.copyFileSync(srcFile, dest1);
      fs.copyFileSync(srcFile, dest2);
      if (fs.existsSync(path.dirname(dest3))) {
        fs.copyFileSync(srcFile, dest3);
      }
      copiedCount++;
    } catch (err) {
      console.error(`Error copying image for ${name}:`, err.message);
    }
  }

  processedItems.push({
    id: idx + 1,
    productQR: barcode,
    name: name,
    mrp: Number(r.MRP || r.SellingPrice || 0),
    purchaseRate: Number(r.PurchaseRate || 0),
    profitPercent: Number(r.ProfitPercent || 0),
    sellingPrice: Number(r.SellingPrice || r.MRP || 0),
    salesUnit: String(r.SalesUnit || 'Piece (pc)').trim(),
    qty: Number(r.Qty || 0),
    category: String(r.Category || 'General').trim(),
    group: 'Non KOT',
    assignedMenu: String(r.AssignedMenu || 'General Menu').trim(),
    stockWarn: Number(r.StockWarn || 5),
    taxType: String(r.TaxType || 'include').trim(),
    taxPercent: Number(r.TaxPercent || 0),
    image: relativeImageUrl,
    isKOTEnabled: false
  });
});

console.log(`Successfully matched and copied images for ${copiedCount} of ${processedItems.length} items!`);

const jsonOutputPath = path.resolve(__dirname, '../prisma/amora-non-kot-products.json');
fs.writeFileSync(jsonOutputPath, JSON.stringify(processedItems, null, 2), 'utf-8');
console.log(`Saved pristine products JSON to: ${jsonOutputPath} (${fs.statSync(jsonOutputPath).size} bytes)`);

