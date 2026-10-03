// Presentation checks use local intercepted APIs; no payment provider or production API is contacted.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const root = path.resolve('dist/mydentalplatform/browser');
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp' };
const server = http.createServer(async (req, res) => {
  try {
    let file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(root + path.sep)) file = path.join(root, 'index.html');
    try { if (!(await fs.stat(file)).isFile()) file = path.join(root, 'index.html'); } catch { file = path.join(root, 'index.html'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' });
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true });
const clinic = { clinicId: '11111111-1111-1111-1111-111111111111', id: '11111111-1111-1111-1111-111111111111', name: 'Payment UI fixture',
  subscriptionPlan: 'starter', subscriptionStatus: 'pending', active: true, theme: 'blue', doctorBio: [], hours: [], services: [], plans: [], testimonials: [], social: {}, phone: '9999999999' };
await fs.mkdir('artifacts/payment-ui', { recursive: true });
try {
  for (const width of [320, 390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    let refreshCount = 0;
    let role = 'clinic-admin', onboardingCount = 0, checkoutCount = 0;
    await page.route('**/api/**', async route => {
      const p = new URL(route.request().url()).pathname;
      let data = {};
      if (p === '/api/auth/refresh') data = { accessToken: 'local-fixture', expiresIn: 3600, user: { id: 'owner', clinicId: clinic.id, role, email: 'owner@example.test', emailVerified: true } };
      else if (p === '/api/public/clinics/slug-available') data = { available: true };
      else if (p === '/api/clinics/onboarding') {
        onboardingCount++;
        role = 'clinic-admin';
        data = { clinicId: clinic.id, plan: 'starter', billingCycle: 'monthly', siteUrl: origin, adminUrl: origin + '/business/clinic/dashboard', email: 'owner@example.test' };
      }
      else if (p === '/api/billing/subscriptions') {
        checkoutCount++;
        if (checkoutCount === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Checkout temporarily unavailable' }) });
        data = { subscriptionId: 'sub_fixture', paymentUrl: 'https://rzp.io/fixture', shortUrl: 'https://rzp.io/fixture', paymentMode: 'subscription', manualPaymentUrl: null, billingCycle: 'monthly', amount: 999 };
      }
      else if (p === '/api/clinics/current') data = clinic;
      else if (p === '/api/billing/subscriptions/current') data = { plan: 'starter', status: 'pending', providerStatus: 'created', paymentUrl: 'https://rzp.io/fixture', payments: [] };
      else if (p === '/api/billing/subscriptions/current/refresh') {
        refreshCount++;
        if (refreshCount === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Provider temporarily unavailable. Please retry.' }) });
        data = { plan: 'starter', status: 'active', providerStatus: 'active', currentPeriodEnd: '2027-01-01T00:00:00Z', payments: [{ reference: 'pay_fixture_long_reference_1234567890', amount: 999, currency: 'INR', paidAt: '2026-10-03T00:00:00Z', provider: 'razorpay' }] };
      } else if (p.endsWith('/doctors') || p.endsWith('/appointments') || p.endsWith('/reviews')) data = [];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto(origin + '/business/clinic/settings?tab=subscription');
    const panel = page.getByRole('region', { name: 'Payment status' });
    await panel.getByRole('link', { name: 'Continue to secure payment' }).waitFor();
    assert.equal(await panel.getByRole('link').getAttribute('href'), 'https://rzp.io/fixture');
    await panel.getByRole('button', { name: 'Check payment status' }).focus();
    await page.keyboard.press('Enter');
    await panel.getByRole('alert').filter({ hasText: 'Provider temporarily unavailable' }).waitFor();
    await panel.getByRole('button', { name: 'Check payment status' }).click();
    await panel.getByText('Your paid plan is active.').waitFor();
    await panel.getByText('pay_fixture_long_reference_1234567890').waitFor();
    assert.equal(await panel.getByRole('link').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Horizontal overflow at ' + width);
    await page.screenshot({ path: 'artifacts/payment-ui/status-' + width + '.png', fullPage: true });
    assert.deepEqual(errors, []);
    role = 'incomplete-signup';
    await page.goto(origin + '/business/signup');
    await page.locator('#signup-clinic-name').fill('Payment Test Clinic');
    await page.locator('#signup-clinic-phone').fill('9999999999');
    await page.getByRole('button', { name: 'Continue → Services and hours' }).click();
    await page.getByRole('button', { name: 'Choose plan', exact: true }).click();
    await page.getByRole('radio', { name: /Basic/ }).click();
    await page.getByRole('button', { name: 'Create clinic and continue to payment' }).click();
    await page.getByRole('alert').filter({ hasText: 'Checkout temporarily unavailable' }).waitFor();
    await page.getByRole('button', { name: 'Retry checkout' }).click();
    await panel.getByRole('link', { name: 'Continue to secure payment' }).waitFor();
    assert.equal(onboardingCount, 1);
    assert.equal(checkoutCount, 2);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Signup horizontal overflow at ' + width);
    await page.screenshot({ path: 'artifacts/payment-ui/signup-' + width + '.png', fullPage: true });
    assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS payment status/keyboard and paid signup checkout-only retry at ' + width + 'px');
  }
} finally { await browser.close(); server.close(); }
