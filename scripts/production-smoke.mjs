// Read-only Playwright checks for a deployed environment. This suite never signs in,
// submits a form, creates data, or follows payment and media-permission prompts.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const value = process.env.PUBLIC_BASE_URL;
if (!value) throw new Error('Set PUBLIC_BASE_URL explicitly, for example https://mydentalplatform.com.');
const base = new URL(value);
if (base.protocol !== 'https:' || base.username || base.password) {
  throw new Error('Production smoke checks require a credential-free HTTPS URL.');
}

const artifactDir = 'artifacts/production-smoke';
await mkdir(artifactDir, { recursive: true });

const routes = [
  { path: '/dentists', heading: /Find your dentist/i },
  { path: '/dentists/noida', heading: /Dental Care Directory for Noida/i },
  { path: '/professional', heading: /Your professional identity/i },
  { path: '/professional/login', heading: /Welcome back/i },
  { path: '/business', heading: /clinic/i },
  { path: '/business/login', heading: /clinic.*sign in|sign in.*clinic/i },
  { path: '/business/privacy', heading: /privacy/i },
  { path: '/business/terms', heading: /terms/i },
  { path: '/platform/login', heading: /platform|admin/i },
  { path: '/appointments', heading: /appointments|sign in/i },
];

const browser = await chromium.launch({ headless: true });
let failed = 0;

async function checkViewport(name, viewport, selectedRoutes) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
  const page = await context.newPage();
  for (const route of selectedRoutes) {
    const errors = [];
    const onPageError = error => errors.push(`pageerror: ${error.message}`);
    const onConsole = message => {
      if (message.type() === 'error' && !/favicon|Failed to load resource.*(?:401|404)/i.test(message.text())) {
        errors.push(`console: ${message.text()}`);
      }
    };
    page.on('pageerror', onPageError);
    page.on('console', onConsole);
    try {
      const response = await page.goto(new URL(route.path, base).href, {
        waitUntil: 'domcontentloaded', timeout: 30_000,
      });
      assert.ok(response, 'navigation returned no response');
      assert.ok(response.status() < 400, `HTTP ${response.status()}`);
      await page.getByRole('heading', { name: route.heading }).first().waitFor({ timeout: 20_000 });
      await page.locator('app-root').waitFor({ state: 'visible' });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 1, `horizontal overflow is ${overflow}px`);
      assert.deepEqual(errors, [], errors.join('\n'));
      console.log(`PASS ${name} ${route.path}`);
    } catch (error) {
      failed++;
      const safeName = route.path.replaceAll('/', '_') || '_root';
      await page.screenshot({ path: `${artifactDir}/${name}-${safeName}.png`, fullPage: true }).catch(() => {});
      console.error(`FAIL ${name} ${route.path}: ${error.message}`);
    } finally {
      page.off('pageerror', onPageError);
      page.off('console', onConsole);
    }
  }
  await context.close();
}

try {
  await checkViewport('desktop', { width: 1440, height: 900 }, routes);
  await checkViewport('mobile', { width: 390, height: 844 }, [
    routes[0], routes[2], routes[4], routes[5], routes[9],
  ]);
} finally {
  await browser.close();
}

if (failed) {
  console.error(`${failed} production smoke check(s) failed. Screenshots are in ${artifactDir}.`);
  process.exitCode = 1;
} else {
  console.log('PASS read-only production smoke checks. Transactional flows still require isolated E2E tests.');
}
