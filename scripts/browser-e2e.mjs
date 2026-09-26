import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const appUrl = process.env.E2E_APP_URL ?? 'http://127.0.0.1:4200';
const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:8080';
if (process.env.E2E_ISOLATED_DB !== '1' || !['localhost', '127.0.0.1'].includes(new URL(apiUrl).hostname)) {
  throw new Error('Browser E2E requires E2E_ISOLATED_DB=1 and a loopback API backed by disposable PostgreSQL.');
}
const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
if (!adminEmail || !adminPassword) throw new Error('Disposable browser E2E requires a bootstrap administrator.');

async function waitFor(url) {
  for (let attempt = 0; attempt < 90; attempt++) {
    try { if ((await fetch(url)).ok) return; } catch { /* server is starting */ }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function post(path, payload, token, expectedStatus = 200) {
  const response = await fetch(apiUrl + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(payload),
  });
  assert.equal(response.status, expectedStatus, `${path} should accept the isolated test fixture`);
  return expectedStatus === 202 || expectedStatus === 204 ? null : response.json();
}

async function get(path, token) {
  const response = await fetch(apiUrl + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  assert.equal(response.status, 200, `${path} should be available in the isolated test`);
  return response.json();
}

async function patch(path, payload, token, expectedStatus = 204) {
  const response = await fetch(apiUrl + path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  assert.equal(response.status, expectedStatus, `${path} should update the isolated test fixture`);
}

await waitFor(apiUrl + '/api/health');
await waitFor(appUrl + '/dentists');
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const password = `Browser-${suffix}-Pass!`;
const patientEmail = `patient-${suffix}@example.test`;
await post('/api/auth/patient/signup', { email: patientEmail, password });
const owner = await post('/api/auth/clinic/signup', { email: `clinic-${suffix}@example.test`, password });
const onboarded = await post('/api/clinics/onboarding', {
  name: 'E2E Clinic', phone: '9876543210', slug: `e2e-clinic-${suffix}`,
  plan: 'trial', city: 'Noida',
}, owner.accessToken);
const clinicOwner = await post('/api/auth/login', { email: `clinic-${suffix}@example.test`, password });
const schedule = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(day =>
  [day, { enabled: true, start: '09:00', end: '17:00' }]));
const doctor = await post('/api/clinics/current/doctors', {
  name: 'E2E Dentist', qualification: 'BDS', speciality: 'General Dentistry',
  available: true, schedule,
}, clinicOwner.accessToken);

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(appUrl + '/dentists');
  await page.getByRole('heading', { name: /Find your dentist/i }).waitFor();
  await page.locator('#dentist-search').fill('root canal');
  await page.locator('#dentist-locality').selectOption({ label: 'Noida' });
  await page.getByRole('button', { name: 'Find Dentists', exact: true }).click();
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

  const admin = await post('/api/auth/login', { email: adminEmail, password: adminPassword });
  const listingSlug = `e2e-verified-${suffix}`;
  await patch(`/api/admin/clinics/${onboarded.clinicId}/marketplace`, {
    status: 'verified', slug: listingSlug, verifiedDoctorIds: [doctor.id],
    profile: {
      region: 'delhi-ncr', locality: 'Noida', speciality: 'General Dentistry',
      serviceIds: ['root-canal'], acceptingNewPatients: true,
      consultationFee: 500, languages: ['English'],
    },
    verification: { source: 'disposable-browser-e2e' },
  }, admin.accessToken);

  const listing = await get(`/api/v1/dentists/${listingSlug}`);
  assert.equal(listing.dentist.slug, listingSlug, 'Published verified fixture must be visible');
  const availability = await get(`/api/v1/dentists/${listingSlug}/availability?days=14`);
  const day = availability.days.find(item => item.slots.length > 0);
  assert.ok(day, 'Verified clinic must expose a future appointment slot');
  const slot = day.slots.find(item => item.doctorId === doctor.id);
  assert.ok(slot, 'Only the verified dentist should have bookable slots');

  const patient = await post('/api/auth/login', { email: patientEmail, password });
  const booked = await post('/api/v1/appointments', {
    dentistSlug: listingSlug, serviceId: 'root-canal', doctorId: doctor.id,
    date: day.date, time: slot.time, patientName: 'E2E Patient',
    phone: '9876543210', email: patientEmail, consentToShare: true,
  }, patient.accessToken);
  assert.equal(booked.status, 'pending');
  assert.ok(booked.bookingReference, 'Booking must receive a reference');

  await page.reload();
  await page.getByText(booked.bookingReference, { exact: true }).waitFor();
  await page.getByRole('heading', { name: 'E2E Clinic' }).waitFor();

  const dentist = await post('/api/auth/professional/signup', {
    email: `dentist-${suffix}@example.test`, password, fullName: 'E2E Video Dentist',
  });
  await patch('/api/providers/me', {
    fullName: 'E2E Video Dentist', qualification: 'BDS', speciality: 'General Dentistry',
    registrationNumber: 'E2E-ONLY', registrationCouncil: 'Disposable test fixture',
    phoneE164: '+919876543210', languages: ['English'],
  }, dentist.accessToken);
  await post('/api/providers/me/locations', {
    name: 'E2E Video Practice', addressLine1: 'Disposable test address', city: 'Noida',
    locality: 'Noida', consultationFee: 400, acceptingNewPatients: true, schedule,
  }, dentist.accessToken, 201);
  await post('/api/providers/me/submit-verification', {}, dentist.accessToken, 202);
  const provider = await get('/api/providers/me', dentist.accessToken);
  await post(`/api/admin/providers/${provider.id}/verify`, {}, admin.accessToken);

  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('heading', { name: 'Sign in to your appointments' }).waitFor();
  await page.goto(`${appUrl}/dentists/${provider.slug}/book?mode=video`);
  await page.getByRole('heading', { name: 'Book a video consultation', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: /In-clinic visit/ }).count(), 0);
  await page.locator('app-slot-picker').getByRole('button', { name: /E2E Video Dentist/ }).first().click();
  await page.getByRole('heading', { name: 'Sign in to continue', exact: true }).waitFor();
  await page.getByRole('textbox', { name: 'Email address' }).fill(patientEmail);
  await page.locator('#auth-password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.locator('#appointment-name').fill('E2E Video Patient');
  await page.locator('#appointment-phone').fill('9876543210');
  await page.getByRole('button', { name: 'Review & Book', exact: true }).click();
  await page.locator('#appointment-privacyAccepted').check();
  await page.getByRole('button', { name: 'Send Appointment Request', exact: true }).click();
  await page.getByRole('heading', { name: 'Your request was sent', exact: true }).waitFor();
  await page.getByRole('link', { name: 'View my appointments', exact: true }).click();
  await page.getByRole('heading', { name: 'E2E Video Dentist', exact: true }).waitFor();

  const inbox = await get('/api/providers/me/appointments?view=pending', dentist.accessToken);
  const videoAppointment = inbox.find(item => item.patient_name === 'E2E Video Patient');
  assert.ok(videoAppointment, 'Independent dentist must receive the patient video request');
  assert.equal(videoAppointment.consultation_mode, 'video');
  await patch(`/api/providers/me/appointments/${videoAppointment.id}/status`, { status: 'confirmed' }, dentist.accessToken, 200);
  await page.reload();
  const videoCard = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'E2E Video Dentist', exact: true }) });
  await videoCard.getByText('Confirmed', { exact: true }).waitFor();
  console.log('PASS Playwright: independent video booking form, dentist inbox/confirmation, and patient-account visibility. Media transport is tested separately.');
  console.log('PASS Playwright: unverified exclusion, verified booking, and patient-account visibility against isolated Spring/PostgreSQL.');
} finally {
  await browser.close();
}
