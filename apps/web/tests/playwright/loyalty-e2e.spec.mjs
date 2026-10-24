import { launchBrowser, newPage, loginAs, assert, emitReport } from './helpers.mjs';
import { BASE_URL } from './config.mjs';

(async () => {
  const browser = await launchBrowser();
  const { page, consoleErrors, pageErrors } = await newPage(browser);
  let adminPageInfo = null;
  try {
    // 1) Login to MainPOS terminal
    await page.goto(`${BASE_URL}/mainpos`, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Fill terminal credentials (main1 / s1234 as requested)
    await page.locator('input[type="text"]').first().fill('main1');
    await page.locator('input[type="password"]').first().fill('s1234');

    await Promise.all([
      page.waitForURL('**/mainpos/terminal', { timeout: 20000 }),
      page.getByRole('button', { name: 'Open Terminal' }).click(),
    ]);

    // Wait for item grid to be present and add first visible item to cart
    await page.waitForSelector('button.group', { timeout: 15000 });
    await page.locator('button.group').first().click();

    // Use a unique phone so the test is idempotent
    const phone = `999${String(Date.now()).slice(-9)}`;
    const name = `E2E Test ${Date.now()}`;

    // Fill customer details
    await page.getByPlaceholder('Phone (Opt)').fill(phone);
    await page.getByPlaceholder('Cust Name (Opt)').fill(name);

    // Pay with Cash (this should create token + payment and award loyalty points)
    // Click the Cash button and wait a short while for API processing
    await page.getByRole('button', { name: 'Cash' }).click();
    await page.waitForTimeout(2500);

    // 2) Open admin page and verify customer + loyalty
    const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const adminPage = await adminCtx.newPage();
    const adminConsoleErrors = [];
    const adminPageErrors = [];
    adminPage.on('console', (m) => { if (m.type() === 'error') adminConsoleErrors.push(m.text()); });
    adminPage.on('pageerror', (e) => adminPageErrors.push(e.message));

    // Login as admin (uses credentials from config.mjs)
    await loginAs(adminPage, 'admin');

    // Fetch customer via admin session using in-page fetch (preserves cookies & reads auth-storage token)
    const customerResp = await adminPage.evaluate(async (phone) => {
      const storageText = localStorage.getItem('auth-storage');
      const storage = JSON.parse(storageText || '{}');
      const token = storage?.state?.token;
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const res = await fetch(`/api/restaurant/customers?search=${encodeURIComponent(phone)}`, { headers });
      try {
        const json = await res.json();
        return { storageText, json };
      } catch (err) {
        return { storageText, error: err.message };
      }
    }, phone);

    assert(customerResp && customerResp.json && Array.isArray(customerResp.json.data) && customerResp.json.data.length > 0, 'Customer not found in admin customers');
    const customer = customerResp.json.data[0];
    assert(Number(customer.loyaltyPoints) > 0, `Expected loyaltyPoints>0 for ${phone}, got ${customer.loyaltyPoints}`);

    // Fetch loyalty report for today and ensure a transaction exists for the phone
    const reportResp = await adminPage.evaluate(async () => {
      const storage = JSON.parse(localStorage.getItem('auth-storage') || '{}');
      const token = storage?.state?.token;
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const now = new Date();
      const start = new Date(now); start.setHours(0,0,0,0);
      const end = new Date(now); end.setHours(23,59,59,999);
      const res = await fetch(`/api/restaurant/reports/loyalty?dateFrom=${encodeURIComponent(start.toISOString())}&dateTo=${encodeURIComponent(end.toISOString())}`, { headers });
      return res.json();
    });

    const transactions = reportResp?.data?.transactions || [];
    const tx = transactions.find((t) => (t.customer && (t.customer.phone === phone || t.customer.name === name)));
    assert(tx, 'No loyalty transaction found for customer in loyalty report');
    assert(Number(tx.points) > 0, 'Loyalty transaction did not award points');

    // Cleanup: delete created customer via admin session
    await adminPage.evaluate(async (id) => {
      const storage = JSON.parse(localStorage.getItem('auth-storage') || '{}');
      const token = storage?.state?.token;
      const headers = token ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
      await fetch(`/api/restaurant/customers/${id}`, { method: 'DELETE', headers });
    }, customer.id);

    adminPageInfo = { adminConsoleErrors, adminPageErrors };

    emitReport('loyalty-e2e.spec', {
      passed: true,
      phone,
      name,
      customerId: customer.id,
      consoleErrors: consoleErrors.concat(adminConsoleErrors),
      pageErrors: pageErrors.concat(adminPageErrors),
    });
  } catch (error) {
    emitReport('loyalty-e2e.spec', {
      passed: false,
      error: String(error.message || error),
    });
    process.exitCode = 1;
  } finally {
    try { await browser.close(); } catch (e) {}
  }
})();
