import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const appUrl = process.env.E2E_APP_URL ?? 'http://127.0.0.1:4200';
const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:8080';
if (process.env.E2E_ISOLATED_DB !== '1' || !['localhost', '127.0.0.1'].includes(new URL(apiUrl).hostname)) {
  throw new Error('Browser E2E requires E2E_ISOLATED_DB=1 and a loopback API backed by disposable PostgreSQL.');
}

async function waitFor(url) {
  for (let attempt = 0; attempt < 90; attempt++) {
    try { if ((await fetch(url)).ok) return; } catch { /* server is starting */ }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function post(path, payload, token) {
  const response = await fetch(apiUrl + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(payload),
  });
  assert.equal(response.status, 200, `${path} should accept the isolated test fixture`);
  return response.json();
}

await waitFor(apiUrl + '/api/health');
await waitFor(appUrl + '/dentists');
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const password = `Browser-${suffix}-Pass!`;
const patientEmail = `patient-${suffix}@example.test`;
await post('/api/auth/patient/signup', { email: patientEmail, password });
const owner = await post('/api/auth/clinic/signup', { email: `clinic-${suffix}@example.test`, password });
await post('/api/clinics/onboarding', {
  name: 'E2E Unverified Clinic', phone: '9876543210', slug: `e2e-clinic-${suffix}`,
  plan: 'trial', city: 'Noida',
}, owner.accessToken);
const clinicOwner = await post('/api/auth/login', { email: `clinic-${suffix}@example.test`, password });
const schedule = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(day =>
  [day, { enabled: true, start: '09:00', end: '17:00' }]));
await post('/api/clinics/current/doctors', {
  name: 'E2E Unverified Dentist', qualification: 'BDS', speciality: 'General Dentistry',
  available: true, schedule,
}, clinicOwner.accessToken);

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(appUrl + '/dentists');
  await page.getByRole('heading', { name: /Find your dentist/i }).waitFor();
  await page.locator('#dentist-search').fill('root canal');
  await page.locator('#dentist-locality').selectOption({ label: 'Noida' });
  await page.getByRole('button', { name: /Find Dentists/i }).click();
  await page.getByRole('heading', { name: /verifying the first dentists/i }).waitFor();
  assert.equal(await page.locator('app-dentist-listing-card').count(), 0,
    'Unverified fixture clinics must not appear in the patient marketplace');

  await page.goto(appUrl + '/appointments');
  await page.getByRole('heading', { name: 'Sign in to your appointments' }).waitFor();
  await page.getByRole('textbox', { name: 'Email address' }).fill(patientEmail);
  await page.locator('#auth-password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('heading', { name: 'Appointments', exact: true }).waitFor();
  await page.getByText(patientEmail, { exact: true }).waitFor();
  await page.getByRole('heading', { name: 'No linked appointments yet' }).waitFor();
  console.log('PASS Playwright: Angular search and patient login against isolated Spring/PostgreSQL fixtures.');
} finally {
  await browser.close();
}
