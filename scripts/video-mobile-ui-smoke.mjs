// Layout-only smoke test with synthetic API responses. Never contacts production.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';

const root = resolve('dist/mydentalplatform/browser');
const server = createServer(async (req, res) => {
  const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try {
    const extension = extname(path);
    const data = await readFile(extension ? path : resolve(root, 'index.html'));
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[extension] ?? 'text/html');
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'chrome' } : {});
const screenshots = await mkdtemp(resolve(tmpdir(), 'video-mobile-ui-'));
try {
  const page = await browser.newPage();
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    let body;
    if (path === '/api/marketplace/clinics/mobile-fixture') body = {
      id: 'fixture', name: 'Dr. Test Dentist', doctorName: 'Dr. Test Dentist',
      marketplaceSlug: 'mobile-fixture', isIndependent: true, services: [], hours: [],
      marketplaceProfile: { acceptingNewPatients: true, videoConsultationEnabled: true, videoConsultationFee: 400 },
    };
    if (path.endsWith('/availability')) body = { days: [{ date: '2030-01-10', slots: ['10:00', '10:30', '11:00'].map(time => ({ doctorId: 'fixture', doctorName: 'Dr. Test Dentist', time })) }] };
    if (path.endsWith('/video-consultations/status')) body = { available: true };
    return route.fulfill({ status: body ? 200 : 401, contentType: 'application/json', body: JSON.stringify(body ?? {}) });
  });
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`http://127.0.0.1:${server.address().port}/dentists/mobile-fixture/book?mode=video`);
    const time = page.getByRole('button', { name: '10:00 AM · Dr. Test Dentist', exact: true });
    await time.waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No horizontal overflow at ${width}px`);
    const box = await time.boundingBox();
    assert.ok(box.height >= 44 && box.width >= 44, 'Time buttons have touch-sized targets');
    assert.ok(box.y + box.height < 844, 'Available times are on the first screen');
    assert.equal(await page.locator('.patient-tab-bar').isVisible(), false);
    assert.equal(await page.locator('footer').isVisible(), false);
    await page.screenshot({ path: resolve(screenshots, `booking-${width}.png`), fullPage: true });
    await time.click();
    await page.getByRole('heading', { name: 'Sign in to continue', exact: true }).waitFor();
    assert.equal(await page.locator('#booking-time-picker').isVisible(), false);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Sign-in fits ${width}px`);
    await page.screenshot({ path: resolve(screenshots, `signin-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Change time', exact: true }).click();
    await time.waitFor();
    console.log(`PASS ${width}px: first-screen times, touch targets, inline sign-in, change time, no overflow`);
  }
  console.log(`Screenshots: ${screenshots}`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
