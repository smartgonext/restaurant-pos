import { chromium } from 'playwright';
import { assert, emitReport } from './helpers.mjs';
import { BASE_URL } from './config.mjs';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(e.message));

  try {
    // 1. Navigate and login as restaurant admin
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.getByTestId('login-admin-tab').click();
    await page.locator('input[type="text"], input[type="email"]').first().fill('demo@spicekitchen.com');
    await page.locator('input[type="password"]').first().fill('admin123');

    await Promise.allSettled([
      page.waitForLoadState('networkidle', { timeout: 15000 }),
      page.getByTestId('login-submit-btn').click(),
    ]);
    await page.waitForTimeout(1000);

    // 2. Perform API loop validation using in-page authenticated fetch
    const testResult = await page.evaluate(async () => {
      const storage = JSON.parse(localStorage.getItem('auth-storage') || '{}');
      const token = storage?.state?.token;
      if (!token) throw new Error('Auth token not found in localStorage');

      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };

      // A. Create Supplier with GSTIN, notes, and creditLimit
      const createRes = await fetch('/api/restaurant/inventory/suppliers', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: 'E2E Test Persistence Vendor',
          contactPerson: 'Arish Kumar',
          email: 'arish@persist.com',
          phone: '+91 9988776655',
          address: 'Phase-I Warehouse, Delhi',
          gstNumber: '07GSTIN1234A1Z1',
          creditLimit: 75000,
          notes: 'Special priority vendor for dairy and poultry supplies.'
        })
      });
      const createJson = await createRes.json();
      if (!createJson.success) return { step: 'CREATE', success: false, error: createJson.error };

      const supplierId = createJson.data.id;

      // B. Fetch Supplier to verify persistence
      const fetchRes = await fetch(`/api/restaurant/inventory/suppliers`, { headers });
      const fetchJson = await fetchRes.json();
      if (!fetchJson.success) return { step: 'FETCH', success: false, error: fetchJson.error };

      const created = fetchJson.data.find(s => s.id === supplierId);
      if (!created) return { step: 'FIND_CREATED', success: false, error: 'Created supplier not found in list' };

      // C. Update Supplier to change notes and increase limit
      const updateRes = await fetch(`/api/restaurant/inventory/suppliers/${supplierId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          name: 'E2E Test Persistence Vendor (Updated)',
          contactPerson: 'Arish Kumar',
          email: 'arish@persist.com',
          phone: '+91 9988776655',
          address: 'Phase-I Warehouse, Delhi',
          gstNumber: '07GSTIN5678B2Z2',
          creditLimit: 90000,
          notes: 'Special priority vendor - extended credit limit for summer season.'
        })
      });
      const updateJson = await updateRes.json();
      if (!updateJson.success) return { step: 'UPDATE', success: false, error: updateJson.error };

      // D. Re-fetch and verify updated parameters
      const fetchUpdatedRes = await fetch(`/api/restaurant/inventory/suppliers`, { headers });
      const fetchUpdatedJson = await fetchUpdatedRes.json();
      const updated = fetchUpdatedJson.data.find(s => s.id === supplierId);

      // E. Cleanup - Delete created Supplier
      await fetch(`/api/restaurant/inventory/suppliers/${supplierId}`, {
        method: 'DELETE',
        headers
      });

      return {
        success: true,
        created: {
          gstNumber: created.gstNumber,
          creditLimit: Number(created.creditLimit),
          notes: created.notes
        },
        updated: {
          name: updated.name,
          gstNumber: updated.gstNumber,
          creditLimit: Number(updated.creditLimit),
          notes: updated.notes
        }
      };
    });

    assert(testResult.success, `API Step ${testResult.step} failed: ${testResult.error}`);

    // Verify initial creation persistence
    assert(testResult.created.gstNumber === '07GSTIN1234A1Z1', `Expected gstNumber '07GSTIN1234A1Z1', got '${testResult.created.gstNumber}'`);
    assert(testResult.created.creditLimit === 75000, `Expected creditLimit 75000, got ${testResult.created.creditLimit}`);
    assert(testResult.created.notes === 'Special priority vendor for dairy and poultry supplies.', `Expected notes, got '${testResult.created.notes}'`);

    // Verify updates persistence
    assert(testResult.updated.name === 'E2E Test Persistence Vendor (Updated)', `Expected name update, got '${testResult.updated.name}'`);
    assert(testResult.updated.gstNumber === '07GSTIN5678B2Z2', `Expected updated gstNumber, got '${testResult.updated.gstNumber}'`);
    assert(testResult.updated.creditLimit === 90000, `Expected updated creditLimit 90000, got ${testResult.updated.creditLimit}`);
    assert(testResult.updated.notes === 'Special priority vendor - extended credit limit for summer season.', `Expected updated notes, got '${testResult.updated.notes}'`);

    emitReport('supplier-persistence.spec', {
      passed: true,
      created: testResult.created,
      updated: testResult.updated,
      consoleErrors,
      pageErrors
    });
  } catch (error) {
    emitReport('supplier-persistence.spec', {
      passed: false,
      error: String(error.message || error),
      consoleErrors,
      pageErrors
    });
    process.exitCode = 1;
  } finally {
    try { await browser.close(); } catch (e) {}
  }
})();
