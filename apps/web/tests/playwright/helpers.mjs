import { chromium } from 'playwright';
import { BASE_URL, CREDENTIALS } from './config.mjs';

export async function launchBrowser() {
  return chromium.launch({ headless: true });
}

export async function newPage(browser, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => pageErrors.push(e.message));

  return { context, page, consoleErrors, pageErrors };
}

export async function loginAs(page, role = 'superadmin') {
  const cred = CREDENTIALS[role];
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });

  await page.getByTestId('login-admin-tab').click();
  await page.locator('input[type="text"], input[type="email"]').first().fill(cred.email);
  await page.locator('input[type="password"]').first().fill(cred.password);

  await Promise.allSettled([
    page.waitForLoadState('networkidle', { timeout: 15000 }),
    page.getByTestId('login-submit-btn').click(),
  ]);

  await page.waitForTimeout(1000);
  return page.url();
}

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function emitReport(name, payload) {
  const report = { test: name, timestamp: new Date().toISOString(), ...payload };
  console.log(JSON.stringify(report, null, 2));
}
