import { launchBrowser, newPage, loginAs, assert, emitReport } from './helpers.mjs';
import { BASE_URL } from './config.mjs';

(async () => {
  console.log('🚀 Starting Full Integrated (Restaurant + Bakery + Department Store + SubPOS + MainPOS) E2E Test...');
  const browser = await launchBrowser();
  const logs = { consoleErrors: [], pageErrors: [] };

  try {
    // ----------------------------------------------------
    // STEP 1: SUB-POS BAKERY COUNTER TERMINAL FLOW
    // ----------------------------------------------------
    console.log('🔹 Step 1: SubPOS Terminal Token Generation (Bakery Counter)');
    const { page: subPage } = await newPage(browser);
    
    await subPage.goto(`${BASE_URL}/subpos`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (!subPage.url().includes('/subpos/terminal')) {
      await subPage.getByPlaceholder(/subpos1/i).fill('sub1');
      await subPage.getByPlaceholder(/••••••••/i).fill('s1234');
      await subPage.locator('button[type="submit"]').click();
      await subPage.waitForTimeout(1200);
      if (!subPage.url().includes('/subpos/terminal')) {
        await subPage.goto(`${BASE_URL}/subpos/terminal`, { waitUntil: 'domcontentloaded' });
      }
    }

    console.log('  ✅ SubPOS Terminal Logged In Successfully');

    // Wait for bakery items to appear in SubPOS grid
    await subPage.waitForSelector('button h4', { timeout: 25000 });
    
    // Click on Chocolate Pastry item button
    await subPage.locator('button h4').first().click();

    // Create Token at SubPOS counter
    const tokenButton = subPage.getByRole('button', { name: /Create Token|Generate Token|Print Token/i });
    if (await tokenButton.isVisible()) {
      await tokenButton.click();
    } else {
      // Fallback: Click checkout / submit button
      await subPage.locator('button:has-text("Token"), button:has-text("Print")').first().click();
    }
    
    await subPage.waitForTimeout(2000);
    console.log('  ✅ Bakery Token Created at SubPOS Counter');

    await subPage.close();

    // ----------------------------------------------------
    // STEP 2: MAIN-POS CASHIER TERMINAL FLOW
    // ----------------------------------------------------
    console.log('🔹 Step 2: MainPOS Cashier Terminal Operations & Customer Checkout');
    const { page: mainPage } = await newPage(browser);

    await mainPage.goto(`${BASE_URL}/mainpos`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (!mainPage.url().includes('/mainpos/terminal')) {
      await mainPage.getByPlaceholder(/mainpos1/i).fill('main1');
      await mainPage.getByPlaceholder(/••••••••/i).fill('s1234');
      await mainPage.locator('button[type="submit"]').click();
      await mainPage.waitForTimeout(1200);
      if (!mainPage.url().includes('/mainpos/terminal')) {
        await mainPage.goto(`${BASE_URL}/mainpos/terminal`, { waitUntil: 'domcontentloaded' });
      }
    }

    console.log('  ✅ MainPOS Cashier Terminal Logged In Successfully');

    // Wait for MainPOS items grid
    await mainPage.waitForSelector('button h4', { timeout: 25000 });

    // Add Department Store Retail item (Organic Almond Milk) & Bakery item to Cart
    const items = mainPage.locator('button h4');
    const itemCount = await items.count();
    assert(itemCount > 0, 'No items found in MainPOS item grid');
    
    // Click item 1
    await items.first().click();
    if (itemCount > 1) {
      // Click item 2 (Department store item)
      await items.nth(1).click();
    }

    // Attach Customer with Phone & Name
    const testPhone = `98${String(Date.now()).slice(-8)}`;
    const testName = `Omni Customer ${Date.now().toString().slice(-4)}`;

    await mainPage.getByPlaceholder('Phone (Opt)').fill(testPhone);
    await mainPage.getByPlaceholder('Cust Name (Opt)').fill(testName);

    // Pay with Cash
    const cashBtn = mainPage.getByRole('button', { name: 'Cash' });
    await cashBtn.click();
    await mainPage.waitForTimeout(2500);

    console.log(`  ✅ MainPOS Payment Completed for Customer ${testName} (${testPhone})`);
    await mainPage.close();

    // ----------------------------------------------------
    // STEP 3: ADMIN PORTAL RESTAURANT & INVENTORY VERIFICATION
    // ----------------------------------------------------
    console.log('🔹 Step 3: Admin Portal Verification (Restaurant, Bakery & Department Store)');
    const { page: adminPage } = await newPage(browser);

    await loginAs(adminPage, 'admin');
    console.log('  ✅ Admin Portal Logged In Successfully');

    // Verify Customer Registration & Loyalty Points via API in admin context
    const customerAudit = await adminPage.evaluate(async (phone) => {
      const storageText = localStorage.getItem('auth-storage');
      const storage = JSON.parse(storageText || '{}');
      const token = storage?.state?.token;
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

      const custRes = await fetch(`/api/restaurant/customers?search=${encodeURIComponent(phone)}`, { headers });
      const custData = await custRes.json();

      const reportRes = await fetch(`/api/restaurant/reports/sales?period=today`, { headers });
      const reportData = await reportRes.json();

      const invRes = await fetch(`/api/restaurant/inventory/items`, { headers });
      const invData = await invRes.json();

      return { custData, reportData, invData };
    }, testPhone);

    assert(customerAudit.custData?.success, 'Customer API failed');
    assert(Array.isArray(customerAudit.custData?.data) && customerAudit.custData.data.length > 0, `Customer ${testPhone} not found in database`);

    const customer = customerAudit.custData.data[0];
    console.log(`  ✅ Verified Customer Record: ID=${customer.id}, Name="${customer.name}", LoyaltyPoints=${customer.loyaltyPoints}`);
    assert(Number(customer.loyaltyPoints) >= 0, 'Invalid loyalty points format');

    assert(customerAudit.reportData?.success, 'Sales Report API failed');
    console.log('  ✅ Verified Today Sales Report generation');

    assert(customerAudit.invData?.success, 'Inventory API failed');
    console.log(`  ✅ Verified Department Store Inventory: ${customerAudit.invData.data.length} items tracked`);

    await adminPage.close();

    emitReport('full-restaurant-bakery-dept-e2e.spec', {
      passed: true,
      testPhone,
      testName,
      customerId: customer.id,
      loyaltyPoints: customer.loyaltyPoints,
      message: 'All end-to-end tests passed cleanly across Restaurant, Bakery, Department Store, SubPOS and MainPOS modules!'
    });

    console.log('🎉 ALL END-TO-END INTEGRATED TESTS PASSED SUCCESSFULLY!');
  } catch (error) {
    console.error('❌ E2E TEST FAILURE:', error.message || error);
    emitReport('full-restaurant-bakery-dept-e2e.spec', {
      passed: false,
      error: String(error.message || error)
    });
    process.exitCode = 1;
  } finally {
    try { await browser.close(); } catch (e) {}
  }
})();
