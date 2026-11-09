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

const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ['--no-sandbox'] });
const screenshots = await mkdtemp(resolve(tmpdir(), 'clinic-mobile-'));
try {
  const page = await browser.newPage();
  let visits = [];
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    let body = [];
    if (path === '/api/auth/refresh') body = { accessToken: 'local-layout-fixture', expiresIn: 3600, user: { id: 'owner', clinicId: 'clinic', role: 'clinic-admin', email: 'clinic@example.test', emailVerified: true } };
    else if (path === '/api/clinics/current') body = { id: 'clinic', name: 'QA 2026-09-28 – Unpublished Test Clinic', subscriptionPlan: 'trial', services: [], hours: [], website: 'https://example.test' };
    else if (path === '/api/clinics/current/appointments') body = visits;
    else if (path === '/api/public/clinics/resolve') return route.fulfill({status:404,contentType:'application/json',body:'{}'});
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({width, height: 760});
    for (const populated of [false, true]) {
      visits = populated ? [{id:'visit', clinicId:'clinic', bookingRef:'BK-TEST', name:'Ananya Sharma', phone:'9999999999', service:'Dental consultation', date:today, time:'10:00', status:'pending'}] : [];
      await page.goto(`http://127.0.0.1:${server.address().port}/business/clinic/dashboard`);
      await page.getByRole('button', {name:'Refresh appointments'}).waitFor();
      await page.getByRole('button', {name:'Today · '+visits.length, exact:true}).waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow');
      if (populated) {
        const patient = page.getByText('Ananya Sharma', {exact:true}).filter({visible:true});
        await patient.waitFor();
        if (width < 768) assert.ok((await patient.boundingBox()).y < 500, 'First patient visible without scrolling');
        await page.getByRole('button', {name:'Needs confirmation · 1', exact:true}).click();
      } else {
        const booking = page.getByRole('link', {name:'Open booking page'});
        await booking.waitFor();
        if (width < 768) assert.ok((await booking.boundingBox()).y + (await booking.boundingBox()).height < 650, 'Empty-state action above bottom navigation');
      }
      await page.screenshot({path:resolve(screenshots, `${populated?'populated':'empty'}-${width}.png`), fullPage:true});
      await page.getByRole('button', {name:'Filters & export',exact:true}).click();
      await page.getByRole('combobox', {name:'Appointment status'}).waitFor();
      await page.getByRole('button', {name:'Filters & export',exact:true}).click();
      await page.getByRole('button', {name:'Enquiries',exact:true}).click();
      console.log(`PASS ${width}px ${populated?'populated':'empty'}: content placement, views, filters, enquiries, no overflow`);
    }
  }
  console.log('Screenshots: '+screenshots);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
