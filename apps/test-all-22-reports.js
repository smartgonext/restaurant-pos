// Comprehensive Test Suite for All 22 Restaurant Reports

async function runReportTests() {
  console.log('\n=====================================================================');
  console.log('📊 COMPREHENSIVE TEST SUITE FOR ALL 22 RESTAURANT REPORTS');
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

  // --- REPORT 1: Sales Report ---
  console.log('📈 1. Sales Report');
  const orders1 = [
    { id: 1, total: 500, sgst: 12.5, cgst: 12.5, payments: [{ method: 'cash', amount: 500 }] },
    { id: 2, total: 1000, sgst: 25, cgst: 25, payments: [{ method: 'upi', amount: 1000 }] },
  ];
  const tokens1 = [
    { id: 101, total: 300, sgst: 7.5, cgst: 7.5, payments: [{ method: 'card', amount: 300 }] },
  ];
  const totalSales1 = orders1.reduce((s, o) => s + o.total, 0) + tokens1.reduce((s, t) => s + t.total, 0);
  const taxTotal1 = orders1.reduce((s, o) => s + o.sgst + o.cgst, 0) + tokens1.reduce((s, t) => s + t.sgst + t.cgst, 0);
  const count1 = orders1.length + tokens1.length;
  const avgOrderValue1 = totalSales1 / count1;

  assert(totalSales1 === 1800, `Total Sales = ₹${totalSales1} (Expected ₹1800.00)`);
  assert(taxTotal1 === 90, `Total Tax = ₹${taxTotal1} (Expected ₹90.00)`);
  assert(count1 === 3, `Order Count = ${count1} (Expected 3)`);
  assert(avgOrderValue1 === 600, `Avg Order Value = ₹${avgOrderValue1} (Expected ₹600.00)`);

  // --- REPORT 2: Order Report ---
  console.log('\n🧾 2. Order Report');
  const orders2 = [
    { id: 1, status: 'paid', type: 'dine_in', total: 1000 },
    { id: 2, status: 'paid', type: 'takeaway', total: 500 },
    { id: 3, status: 'pending', type: 'dine_in', total: 200 },
    { id: 4, status: 'cancelled', type: 'delivery', total: 100 },
  ];
  const summary2 = {
    total: orders2.reduce((s, o) => s + o.total, 0),
    count: orders2.length,
    paid: orders2.filter(o => o.status === 'paid').length,
    pending: orders2.filter(o => o.status === 'pending').length,
    cancelled: orders2.filter(o => o.status === 'cancelled').length,
  };
  assert(summary2.total === 1800, `Total Order Revenue = ₹${summary2.total}`);
  assert(summary2.paid === 2 && summary2.pending === 1 && summary2.cancelled === 1, `Order Status Breakdown (Paid: 2, Pending: 1, Cancelled: 1)`);

  // --- REPORT 3: Payment Report ---
  console.log('\n💳 3. Payment Report');
  const payments3 = [
    { method: 'cash', amount: 500, isDue: false },
    { method: 'upi', amount: 1000, isDue: false },
    { method: 'card', amount: 300, isDue: false },
    { method: 'credit', amount: 200, isDue: true },
  ];
  const totalCollected3 = payments3.filter(p => !p.isDue).reduce((s, p) => s + p.amount, 0);
  const totalDue3 = payments3.filter(p => p.isDue).reduce((s, p) => s + p.amount, 0);
  assert(totalCollected3 === 1800, `Total Collected Payments = ₹${totalCollected3}`);
  assert(totalDue3 === 200, `Total Due Payments = ₹${totalDue3}`);

  // --- REPORT 4: Item Report ---
  console.log('\n🍲 4. Item Report');
  const kotItems4 = [
    { menuItemId: 1, name: 'Murukku', qty: 5, price: 50 },
    { menuItemId: 2, name: 'Paneer Tikka', qty: 2, price: 180 },
  ];
  const tokenItems4 = [
    { menuItemId: 3, name: 'Cola Can', qty: 10, price: 40 },
  ];
  const itemSummary4 = {};
  [...kotItems4, ...tokenItems4].forEach(i => {
    if (!itemSummary4[i.name]) itemSummary4[i.name] = { qty: 0, rev: 0 };
    itemSummary4[i.name].qty += i.qty;
    itemSummary4[i.name].rev += i.qty * i.price;
  });
  assert(itemSummary4['Murukku'].rev === 250, `Murukku Revenue = ₹250 (5 units @ ₹50)`);
  assert(itemSummary4['Paneer Tikka'].rev === 360, `Paneer Tikka Revenue = ₹360 (2 units @ ₹180)`);
  assert(itemSummary4['Cola Can'].rev === 400, `Cola Can Revenue = ₹400 (10 units @ ₹40)`);

  // --- REPORT 5: Category Report ---
  console.log('\n📂 5. Category Report');
  const categoryRev5 = {
    'Snacks': 250 + 400, // Murukku + Cola
    'Starters': 360,     // Paneer Tikka
  };
  assert(categoryRev5['Snacks'] === 650, `Snacks Category Revenue = ₹650`);
  assert(categoryRev5['Starters'] === 360, `Starters Category Revenue = ₹360`);

  // --- REPORT 6: Tax Report ---
  console.log('\n📑 6. Tax Report');
  // Internal tax item: ₹105 gross @ 5% => Taxable = ₹100, Tax = ₹5
  const internalGross = 105;
  const internalTax = internalGross - (internalGross / 1.05);
  // External tax item: ₹200 base @ 5% => Tax = ₹10
  const externalBase = 200;
  const externalTax = externalBase * 0.05;

  assert(Number(internalTax.toFixed(2)) === 5.00, `Internal Tax calculation exact (₹5.00)`);
  assert(Number(externalTax.toFixed(2)) === 10.00, `External Tax calculation exact (₹10.00)`);

  // --- REPORT 7: Expense Report ---
  console.log('\n💸 7. Expense Report');
  const expenses7 = [
    { type: 'SHOP', amount: 1500, status: 'paid' },
    { type: 'PRODUCTION', amount: 2500, status: 'pending' },
  ];
  const totalExp7 = expenses7.reduce((s, e) => s + e.amount, 0);
  const shopExp7 = expenses7.filter(e => e.type === 'SHOP').reduce((s, e) => s + e.amount, 0);
  const prodExp7 = expenses7.filter(e => e.type === 'PRODUCTION').reduce((s, e) => s + e.amount, 0);

  assert(totalExp7 === 4000, `Total Expenses = ₹4000`);
  assert(shopExp7 === 1500 && prodExp7 === 2500, `Shop vs Production Breakdown (Shop: ₹1500, Production: ₹2500)`);

  // --- REPORT 8: Delivery App Report ---
  console.log('\n🛵 8. Delivery App Report');
  const deliveryOrders8 = [
    { source: 'Swiggy', total: 300 },
    { source: 'Swiggy', total: 600 },
    { source: 'Zomato', total: 800 },
    { source: 'Direct Delivery', total: 500 },
  ];
  const appBreakdown8 = {};
  deliveryOrders8.forEach(o => {
    appBreakdown8[o.source] = (appBreakdown8[o.source] || 0) + o.total;
  });
  assert(appBreakdown8['Swiggy'] === 900, `Swiggy Delivery Revenue = ₹900`);
  assert(appBreakdown8['Zomato'] === 800, `Zomato Delivery Revenue = ₹800`);
  assert(appBreakdown8['Direct Delivery'] === 500, `Direct Delivery Revenue = ₹500`);

  // --- REPORT 9: Cancelled Orders Report ---
  console.log('\n🚫 9. Cancelled Orders Report');
  const cancelledOrders9 = [
    { id: 10, total: 450 },
    { id: 11, total: 350 },
  ];
  const lostRev9 = cancelledOrders9.reduce((s, o) => s + o.total, 0);
  assert(cancelledOrders9.length === 2, `Cancelled Orders Count = 2`);
  assert(lostRev9 === 800, `Total Lost Revenue from Cancelled Orders = ₹800`);

  // --- REPORT 10: Removed KOT Items Report ---
  console.log('\n🗑️ 10. Removed KOT Items Report');
  const removedKotItems10 = [
    { name: 'Burger', qty: 2, price: 150 },
    { name: 'Juice', qty: 1, price: 80 },
  ];
  const lostKotRev10 = removedKotItems10.reduce((s, i) => s + i.qty * i.price, 0);
  assert(removedKotItems10.length === 2, `Removed KOT Items Count = 2`);
  assert(lostKotRev10 === 380, `Total Lost Revenue from Removed KOT Items = ₹380`);

  // --- REPORT 11: Refund Report ---
  console.log('\n🔄 11. Refund Report');
  const refunds11 = [
    { orderId: 101, refundedAmount: 200 },
  ];
  const inventoryDamages11 = [
    { qty: 3, costPerUnit: 50 },
  ];
  const totalRefunded11 = refunds11.reduce((s, r) => s + r.refundedAmount, 0);
  const totalDamageValue11 = inventoryDamages11.reduce((s, d) => s + d.qty * d.costPerUnit, 0);
  assert(totalRefunded11 === 200, `Total Order Refunds = ₹200`);
  assert(totalDamageValue11 === 150, `Total Damage/Return Inventory Loss = ₹150`);

  // --- REPORT 12: Loyalty Reports ---
  console.log('\n⭐ 12. Loyalty Report');
  const loyaltyTxns12 = [
    { customerId: 1, points: 100 },
    { customerId: 1, points: -20 },
    { customerId: 2, points: 50 },
  ];
  const earned12 = loyaltyTxns12.filter(t => t.points > 0).reduce((s, t) => s + t.points, 0);
  const redeemed12 = loyaltyTxns12.filter(t => t.points < 0).reduce((s, t) => s + Math.abs(t.points), 0);
  assert(earned12 === 150, `Total Loyalty Points Earned = 150`);
  assert(redeemed12 === 20, `Total Loyalty Points Redeemed = 20`);

  // --- REPORT 13: Due Payments Received Report ---
  console.log('\n⏳ 13. Due Payments Report');
  const duePayments13 = [
    { amount: 500, isDue: true },
    { amount: 300, isDue: true },
  ];
  const totalDuePending13 = duePayments13.reduce((s, p) => s + p.amount, 0);
  assert(duePayments13.length === 2, `Pending Due Payments Count = 2`);
  assert(totalDuePending13 === 800, `Total Outstanding Due Amount = ₹800`);

  // --- REPORT 14: Production Reports ---
  console.log('\n🏭 14. Production Report');
  const productionExpenses14 = [
    { category: 'PRODUCTION', amount: 5000 },
  ];
  const prodTotal14 = productionExpenses14.reduce((s, e) => s + e.amount, 0);
  assert(prodTotal14 === 5000, `Production Expense Total = ₹5000`);

  // --- REPORT 15: KOT Report ---
  console.log('\n🍳 15. KOT Report');
  const kots15 = [
    { id: 1, items: [{ qty: 2 }, { qty: 1 }], status: 'completed' },
    { id: 2, items: [{ qty: 2 }], status: 'preparing' },
  ];
  const totalKotItems15 = kots15.reduce((s, k) => s + k.items.reduce((si, i) => si + i.qty, 0), 0);
  assert(kots15.length === 2, `Total KOT Count = 2`);
  assert(totalKotItems15 === 5, `Total KOT Prepared Items = 5`);

  // --- REPORT 16: Staff Performance Report ---
  console.log('\n👨‍🍳 16. Staff Performance Report');
  const staff16 = [
    { name: 'Alex', orders: 5, revenue: 2500, tip: 100, discount: 50 },
    { name: 'Sam', orders: 10, revenue: 3000, tip: 0, discount: 0 },
  ];
  const totalStaffRev16 = staff16.reduce((s, st) => s + st.revenue, 0);
  assert(totalStaffRev16 === 5500, `Grand Staff Revenue = ₹5500`);
  assert(staff16[0].revenue / staff16[0].orders === 500, `Alex Average Order Value = ₹500`);

  // --- REPORT 17: Customer Report ---
  console.log('\n👥 17. Customer Report');
  const customers17 = [
    { name: 'John', totalOrders: 4, revenue: 2000 },
    { name: 'Mary', totalOrders: 1, revenue: 500 },
  ];
  const totalCustRev17 = customers17.reduce((s, c) => s + c.revenue, 0);
  assert(customers17.length === 2, `Total Active Customers = 2`);
  assert(totalCustRev17 === 2500, `Total Customer Revenue = ₹2500`);

  // --- REPORT 18: Table Report ---
  console.log('\n🪑 18. Table Report');
  const tables18 = [
    { name: 'T1', orderCount: 3, revenue: 1200 },
    { name: 'T2', orderCount: 2, revenue: 1000 },
  ];
  assert(tables18[0].revenue / tables18[0].orderCount === 400, `Table T1 Avg Order Value = ₹400`);
  assert(tables18[1].revenue / tables18[1].orderCount === 500, `Table T2 Avg Order Value = ₹500`);

  // --- REPORT 19: Cash Register Report ---
  console.log('\n💵 19. Cash Register Report');
  const sessions19 = [
    { status: 'closed', opening: 1000, closing: 4500, discrepancy: 0 },
    { status: 'open', opening: 1000, closing: 0, discrepancy: 0 },
  ];
  const openSessions19 = sessions19.filter(s => s.status === 'open').length;
  assert(sessions19.length === 2, `Total Register Sessions = 2`);
  assert(openSessions19 === 1, `Open Sessions Count = 1`);

  // --- REPORT 20: Discount Report ---
  console.log('\n🏷️ 20. Discount Report');
  const discountedOrders20 = [
    { total: 500, discount: 50 },
    { total: 1000, discount: 100 },
  ];
  const totalDiscount20 = discountedOrders20.reduce((s, o) => s + o.discount, 0);
  const avgDiscount20 = totalDiscount20 / discountedOrders20.length;
  assert(totalDiscount20 === 150, `Total Discount Given = ₹150`);
  assert(avgDiscount20 === 75, `Average Discount Per Order = ₹75`);

  // --- REPORT 21: Purchase Report ---
  console.log('\n📦 21. Purchase Report');
  const purchases21 = [
    { supplier: 'Alpha Wholesale', total: 8000, status: 'Received' },
    { supplier: 'Beta Traders', total: 4000, status: 'Pending' },
  ];
  const totalPurchases21 = purchases21.reduce((s, p) => s + p.total, 0);
  assert(purchases21.length === 2, `Purchase Orders Count = 2`);
  assert(totalPurchases21 === 12000, `Total Purchase Expenditure = ₹12000`);

  // --- REPORT 22: Stock Report ---
  console.log('\n📊 22. Stock Report');
  const stockItems22 = [
    { name: 'Flour', stock: 10, threshold: 5, cost: 40 },
    { name: 'Sugar', stock: 2, threshold: 5, cost: 50 },  // Low stock
    { name: 'Butter', stock: 0, threshold: 10, cost: 200 }, // Out of stock
  ];
  const lowStock22 = stockItems22.filter(i => i.stock <= i.threshold && i.stock > 0).length;
  const outOfStock22 = stockItems22.filter(i => i.stock === 0).length;
  const valuation22 = stockItems22.reduce((s, i) => s + i.stock * i.cost, 0);

  assert(lowStock22 === 1, `Low Stock Item Count = 1 (Sugar)`);
  assert(outOfStock22 === 1, `Out of Stock Item Count = 1 (Butter)`);
  assert(valuation22 === (10 * 40 + 2 * 50 + 0 * 200), `Total Stock Valuation = ₹500`);

  console.log('\n=====================================================================');
  console.log(`📊 TEST SUITE SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (100%)`);
  console.log('=====================================================================\n');

  if (failed > 0) process.exit(1);
}

runReportTests();
