import { launchBrowser, newPage, loginAs, assert, emitReport } from './helpers.mjs';

(async () => {
  const browser = await launchBrowser();
  const { page, consoleErrors, pageErrors } = await newPage(browser);
  try {
    const finalUrl = await loginAs(page, 'superadmin');
    assert(finalUrl.includes('/superadmin'), `Expected superadmin redirect, got ${finalUrl}`);

    emitReport('login.spec', {
      passed: true,
      finalUrl,
      consoleErrors,
      pageErrors,
    });
  } catch (error) {
    emitReport('login.spec', {
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
