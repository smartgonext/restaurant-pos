import { launchBrowser, newPage, loginAs, assert, emitReport } from './helpers.mjs';
import { BASE_URL } from './config.mjs';

(async () => {
  const browser = await launchBrowser();
  const { page, consoleErrors, pageErrors } = await newPage(browser);
  const paths = [
    '/superadmin',
    '/superadmin/restaurants',
    '/superadmin/packages',
    '/superadmin/billing',
    '/superadmin/payments',
    '/superadmin/offline-requests',
    '/superadmin/members',
    '/superadmin/settings',
  ];

  const results = [];

  try {
    await loginAs(page, 'superadmin');

    for (const path of paths) {
      await page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(500);
      const landed = page.url();
      const isOk = landed.includes(path);
      results.push({ path, landed, ok: isOk });
      assert(isOk, `Navigation failed for ${path}, landed on ${landed}`);
    }

    emitReport('navigation.spec', {
      passed: true,
      results,
      consoleErrors,
      pageErrors,
    });
  } catch (error) {
    emitReport('navigation.spec', {
      passed: false,
      error: String(error.message || error),
      results,
      consoleErrors,
      pageErrors,
    });
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
