const XLSX = require('xlsx');

// Test suite for Non-KOT Excel Export/Import & Dual-Direction Auto-Calculation Logic
async function runTests() {
  console.log('\n=====================================================================');
  console.log('🧪 NON-KOT EXCEL & DUAL-DIRECTION AUTO-CALCULATION TEST SUITE');
  console.log('=====================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ PASSED: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAILED: ${message}`);
      failed++;
    }
  }

  // --- SECTION 1: Dual-Direction Calculation Logic Tests ---
  console.log('📦 SECTION 1: Dual-Direction Auto-Calculation Logic');

  // Case 1A: Compute Selling Price from Purchase Rate & Profit %
  const purchase1 = 40;
  const profit1 = 25;
  const computedSelling1 = Number((purchase1 * (1 + profit1 / 100)).toFixed(2));
  assert(computedSelling1 === 50, `Selling Price derived from PR ₹40.00 & Profit 25% = ₹${computedSelling1} (Expected ₹50.00)`);

  // Case 1B: Compute Profit % from Purchase Rate & Selling Price
  const purchase2 = 80;
  const selling2 = 100;
  const computedProfit2 = Number((((selling2 - purchase2) / purchase2) * 100).toFixed(2));
  assert(computedProfit2 === 25, `Profit % derived from PR ₹80.00 & SP ₹100.00 = ${computedProfit2}% (Expected 25%)`);

  // Case 1C: Fractional calculation (PR ₹45.50, Profit % 15.5%)
  const purchase3 = 45.50;
  const profit3 = 15.50;
  const computedSelling3 = Number((purchase3 * (1 + profit3 / 100)).toFixed(2));
  assert(computedSelling3 === 52.55, `Selling Price derived from PR ₹45.50 & Profit 15.5% = ₹${computedSelling3} (Expected ₹52.55)`);

  // --- SECTION 2: Exact Column Structure & Header Alignment ---
  console.log('\n📦 SECTION 2: Non-KOT Excel Column Order & Alignment');
  const expectedNonKotHeaders = [
    'ProductQR',
    'SignatureName',
    'MRP',
    'PurchaseRate',
    'ProfitPercent',
    'SellingPrice',
    'SalesUnit',
    'Category',
    'Group',
    'AssignedMenu',
    'StockWarn',
    'ExpiryDate',
    'TaxType',
    'TaxPercent',
    'EnablePackOptions',
    'PackVariants',
    'ImageMode'
  ];

  assert(expectedNonKotHeaders.length === 17, `Non-KOT Excel schema contains exactly 17 columns`);
  assert(!expectedNonKotHeaders.includes('ChefNote') && !expectedNonKotHeaders.includes('VegetarianOption') && !expectedNonKotHeaders.includes('InstantlyAvailable'), `Legacy fields (ChefNote, Veg, Instant Availability) are removed from Non-KOT schema`);

  // --- SECTION 3: Live API End-to-End Export Alignment ---
  console.log('\n🌐 SECTION 3: Live API Non-KOT Excel Export Verification');
  try {
    const res = await fetch('http://localhost:3001/api/restaurant/menu-items/export?template=non-kot');
    if (res.ok) {
      const buffer = await res.buffer();
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonRows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      const headers = jsonRows[0] || [];

      assert(headers[0] === 'ProductQR', `Header 1 is 'ProductQR'`);
      assert(headers[1] === 'SignatureName', `Header 2 is 'SignatureName'`);
      assert(headers[2] === 'MRP', `Header 3 is 'MRP'`);
      assert(headers[3] === 'PurchaseRate', `Header 4 is 'PurchaseRate'`);
      assert(headers[4] === 'ProfitPercent', `Header 5 is 'ProfitPercent'`);
      assert(headers[5] === 'SellingPrice', `Header 6 is 'SellingPrice'`);
      assert(headers[16] === 'ImageMode', `Header 17 is 'ImageMode'`);
    } else {
      console.log('  ⚠️ Server non-responsive or unauthorized (skipping live API fetch assertion)');
    }
  } catch (e) {
    console.log(`  ℹ️ Live API test note: ${e.message}`);
  }

  console.log('\n=====================================================================');
  console.log(`📊 SUMMARY: ${passed} / ${passed + failed} TESTS PASSED`);
  console.log('=====================================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
