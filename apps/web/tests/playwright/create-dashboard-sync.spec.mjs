import { launchBrowser, newPage, loginAs, assert, emitReport } from './helpers.mjs';
import { BASE_URL } from './config.mjs';

(async () => {
  const browser = await launchBrowser();
  const { page, consoleErrors, pageErrors } = await newPage(browser);

  try {
    await loginAs(page, 'superadmin');

    await page.goto(`${BASE_URL}/superadmin`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(500);
    const beforeText = await page.getByTestId('stat-total-restaurants').innerText();
    const before = Number((beforeText.match(/\d+/) || [])[0] || 0);

    await page.goto(`${BASE_URL}/superadmin/restaurants`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(500);

    const uid = Date.now();
    const name = `QA Sync ${uid}`;
    const email = `qa-sync-${uid}@example.com`;

    await page.getByTestId('add-restaurant-btn').click();
    await page.waitForTimeout(300);

    await page.locator('input[placeholder="e.g. The Spice Kitchen"]').fill(name);
    await page.locator('input[placeholder="admin@restaurant.com"]').fill(email);
    await page.locator('input[placeholder="+1 555-0123"]').fill('9999999999');
    await page.locator('input[placeholder="123 Food Street"]').fill('QA Street');
    await page.getByTestId('submit-restaurant-modal-btn').click();
    await page.waitForTimeout(1500);

    await page.getByTestId('restaurants-search-input').fill(name);
    await page.waitForTimeout(500);
    const rowCount = await page.getByText(name).count();
    assert(rowCount > 0, 'Created restaurant not visible in restaurants list');

    await page.goto(`${BASE_URL}/superadmin`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(700);
    const afterText = await page.getByTestId('stat-total-restaurants').innerText();
    const after = Number((afterText.match(/\d+/) || [])[0] || 0);

    assert(after >= before, `Dashboard total restaurants regressed: before=${before}, after=${after}`);

    emitReport('create-dashboard-sync.spec', {
      passed: true,
      before,
      after,
      createdVisible: rowCount > 0,
      consoleErrors,
      pageErrors,
    });
  } catch (error) {
    emitReport('create-dashboard-sync.spec', {
      passed: false,
      error: String(error.message || error),
      consoleErrors,
      pageErrors,
    });
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
