import { launchBrowser, newPage, loginAs, assert, emitReport } from './helpers.mjs';
import { BASE_URL, VIEWPORTS } from './config.mjs';

(async () => {
  const browser = await launchBrowser();
  const { page, consoleErrors, pageErrors } = await newPage(browser);
  const checks = [];

  try {
    await loginAs(page, 'superadmin');

    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${BASE_URL}/superadmin`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(500);
      const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      checks.push({ viewport: vp.name, overflowX });
      assert(!overflowX, `Horizontal overflow detected on ${vp.name}`);
    }

    emitReport('responsive-smoke.spec', {
      passed: true,
      checks,
      consoleErrors,
      pageErrors,
    });
  } catch (error) {
    emitReport('responsive-smoke.spec', {
      passed: false,
      error: String(error.message || error),
      checks,
      consoleErrors,
      pageErrors,
    });
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
