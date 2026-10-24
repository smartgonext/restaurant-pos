import { launchBrowser, newPage, loginAs, emitReport } from './helpers.mjs';
import { BASE_URL } from './config.mjs';

(async () => {
  const browser = await launchBrowser();
  const { page } = await newPage(browser);
  const failed = [];

  page.on('response', async (resp) => {
    const s = resp.status();
    if (s >= 400) {
      failed.push({ status: s, url: resp.url(), method: resp.request().method() });
    }
  });

  await loginAs(page, 'superadmin');
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

  for (const p of paths) {
    await page.goto(`${BASE_URL}${p}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(600);
  }

  emitReport('debug-403.spec', { failed });
  await browser.close();
})();
