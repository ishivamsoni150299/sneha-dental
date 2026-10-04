import assert from 'node:assert/strict';
import pg from 'pg';
import { chromium } from 'playwright';
import { checkUxRoutes } from './ux-route-checks.mjs';

const { Client } = pg;

const appUrl = process.env.E2E_APP_URL ?? 'http://127.0.0.1:4200';
const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:8080';
if (process.env.E2E_ISOLATED_DB !== '1' || !['localhost', '127.0.0.1'].includes(new URL(apiUrl).hostname)) {
  throw new Error('Browser E2E requires E2E_ISOLATED_DB=1 and a loopback API backed by disposable PostgreSQL.');
}
const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
if (!adminEmail || !adminPassword) throw new Error('Disposable browser E2E requires a bootstrap administrator.');

async function sql(query) {
  const client = new Client({
    host: process.env.DATABASE_HOST ?? '127.0.0.1',
    port: Number(process.env.DATABASE_PORT ?? '5432'),
    user: process.env.DATABASE_USERNAME ?? 'postgres',
    database: process.env.DATABASE_NAME ?? 'postgres',
    password: process.env.DATABASE_PASSWORD || undefined,
  });
  await client.connect();
  try {
    const result = await client.query(query);
    return result.rows.map(row => Object.values(row).join('|')).join('\n').trim();
  } finally {
    await client.end();
  }
}

async function claimCodeFor(email) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const html = await sql(`select payload ->> 'html' from dental.notification_outbox
      where notification_type = 'appointment_claim' and destination = '${email}'
      order by created_at desc limit 1`);
    const code = html.match(/<strong>(\d{8})<\/strong>/)?.[1];
    if (code) return code;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Claim code was not written to the isolated notification outbox.');
}

async function passwordLogin(page, url, email, password) {
  await page.goto(url);
  await page.getByRole('textbox', { name: 'Email address' }).fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

async function verifyBookingMobile(page) {
  if (process.env.E2E_BOOKING_OTP !== '1') return;
  await page.getByRole('button', { name: 'Send verification code', exact: true }).click();
  await page.getByLabel('Verification code', { exact: true }).fill('000000');
  const rejectedCode = page.waitForResponse(response => response.url().endsWith('/api/public/booking-verification/verify'));
  await page.getByRole('button', { name: 'Verify mobile', exact: true }).click();
  const rejected = await rejectedCode;
  assert.equal(rejected.status(), 400, await rejected.text());
  await page.getByRole('alert').filter({ hasText: 'Incorrect code' }).waitFor();
  await page.getByLabel('Verification code', { exact: true }).fill('123456');
  await page.getByRole('button', { name: 'Verify mobile', exact: true }).click();
  await page.getByText('Mobile verified. Submit your request within 10 minutes.').waitFor();
}

async function waitFor(url) {
  for (let attempt = 0; attempt < 90; attempt++) {
    try { if ((await fetch(url)).ok) return; } catch { /* server is starting */ }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function post(path, payload, token, expectedStatus = 200) {
  let proof;
  if (process.env.E2E_BOOKING_OTP === '1' && ['/api/v1/appointments', '/api/public/appointments'].includes(path)) {
    await post('/api/public/booking-verification/request', { phone: payload.phone }, null, 200);
    proof = (await post('/api/public/booking-verification/verify', { phone: payload.phone, code: '123456' })).proof;
  }
  const response = await fetch(apiUrl + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(proof ? { 'X-Booking-Verification': proof } : {}) },
    body: JSON.stringify(payload),
  });
  assert.equal(response.status, expectedStatus, `${path} should accept the isolated test fixture`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
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
if (process.env.E2E_BOOKING_OTP === '1') await sql('delete from dental.auth_otp_limits');
await waitFor(appUrl + '/dentists');
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const password = `Browser-${suffix}-Pass!`;
const patientEmail = `patient-${suffix}@example.test`;
const clinicEmail = `clinic-${suffix}@example.test`;
await post('/api/auth/patient/signup', { email: patientEmail, password });
const owner = await post('/api/auth/clinic/signup', { email: clinicEmail, password });
const onboarded = await post('/api/clinics/onboarding', {
  name: 'E2E Clinic', phone: '9876543210', slug: `e2e-clinic-${suffix}`,
  plan: 'trial', city: 'Noida',
}, owner.accessToken);
const clinicOwner = await post('/api/auth/login', { email: clinicEmail, password });
const schedule = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(day =>
  [day, { enabled: true, start: '09:00', end: '17:00' }]));
const doctor = await post('/api/clinics/current/doctors', {
  name: 'E2E Dentist', qualification: 'BDS', speciality: 'General Dentistry',
  available: true, schedule,
}, clinicOwner.accessToken);

const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}) });
try {
  const page = await browser.newPage();
  const admin = await post('/api/auth/login', { email: adminEmail, password: adminPassword });
  for (const [path, location] of [
    ['/dentists/noida', 'Noida'],
    ['/dentists/noida/sector-75', 'Sector 75'],
  ]) {
    await page.goto(appUrl + path);
    await page.locator('#dentist-locality').waitFor();
    assert.equal(await page.locator('#dentist-locality').inputValue(), location);
    assert.equal(await page.locator('a[href="/dentists/sector-75"]').count(), 0);
  }
  await page.goto(appUrl + '/business/clinic/expired');
  await page.waitForURL('**/account?**');
  assert.equal(await page.getByRole('button', { name: 'Reactivate with Basic' }).count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(appUrl + '/professional');
  await page.getByRole('heading', { name: 'Build your verified dentist profile' }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/professional');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
    'Dentist mobile header must fit the viewport');
  const menuButton = page.getByRole('button', { name: 'Open navigation menu', exact: true });
  const menuBounds = await menuButton.boundingBox();
  assert.ok(menuBounds && menuBounds.height >= 44, 'Mobile navigation must have an accessible touch target');
  await menuButton.click();
  const menu = page.getByRole('dialog', { name: 'Explore My Dental Platform' });
  await menu.waitFor();
  const signIn = menu.getByRole('link', { name: 'Sign in or create an account', exact: true });
  const signInBounds = await signIn.boundingBox();
  assert.ok(signInBounds && signInBounds.height >= 44, 'Mobile sign-in must have an accessible touch target');
  await menu.getByRole('button', { name: 'Close navigation menu' }).press('Escape');
  await menu.waitFor({ state: 'hidden' });
  assert.equal(await menuButton.evaluate(element => element === document.activeElement), true,
    'Closing mobile navigation must restore focus to its opener');
  await menuButton.click();
  await signIn.click();
  await page.waitForURL('**/account');
  assert.equal(await menu.count(), 0, 'Navigation must close after choosing a destination');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(appUrl + '/dentists');
  await page.getByRole('heading', { name: /Find your dentist/i }).waitFor();
  await page.locator('#dentist-search').fill('root canal');
  await page.locator('#dentist-locality').selectOption({ label: 'Noida' });
  await page.getByRole('button', { name: 'Find Dentists', exact: true }).click();
  await page.getByText('Checking verified profiles and appointment times.').waitFor({ state: 'hidden' });
  assert.equal(await page.locator(`a[href="/clinic/e2e-clinic-${suffix}"]`).count(), 0,
    'The new unverified fixture must not appear, even when earlier verified test clinics exist');
  const unpublishedProfile = await fetch(`${apiUrl}/api/v1/dentists/e2e-clinic-${suffix}`);
  assert.equal(unpublishedProfile.status, 404, 'Unverified clinic profiles must stay inaccessible');
  await page.locator('#dentist-search').fill(`No matching dentist ${suffix}`);
  await page.getByRole('button', { name: 'Find Dentists', exact: true }).click();
  const dentistRequest = page.locator('app-request-dentist');
  await dentistRequest.getByRole('heading', { name: 'Request a dentist' }).waitFor();
  assert.equal(await page.getByRole('button', { name: /All filters/ }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Available today', exact: true }).count(), 0);
  await dentistRequest.getByLabel('Location', { exact: true }).fill('Noida');
  await dentistRequest.getByLabel('Treatment or problem', { exact: true }).fill('Root canal advice');
  const preferredDate = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  await dentistRequest.getByLabel('Preferred date', { exact: true }).fill(preferredDate);
  await dentistRequest.getByLabel('Preferred time (India)', { exact: true }).fill('11:00');
  await dentistRequest.getByLabel('Your name', { exact: true }).fill(`Request ${suffix}`);
  await dentistRequest.getByLabel('Mobile number', { exact: true }).fill('9876543210');
  await dentistRequest.getByRole('checkbox').check();
  await dentistRequest.getByRole('button', { name: 'Send dentist request', exact: true }).click();
  await dentistRequest.getByRole('status').filter({ hasText: 'Your request has been saved' }).waitFor();
  const requests = await get('/api/admin/dentist-requests', admin.accessToken);
  assert.ok(requests.some(request => request.patient_name === `Request ${suffix}` && request.status === 'new'));

  await page.goto(appUrl + '/appointments');
  await page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor();
  await page.getByRole('textbox', { name: 'Email address' }).fill(patientEmail);
  await page.locator('#auth-password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('heading', { name: 'Appointments', exact: true }).waitFor();
  await page.getByText(patientEmail, { exact: true }).waitFor();
  await page.getByRole('heading', { name: 'No linked appointments yet' }).waitFor();

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
  const day = availability.days.find(item =>
    item.slots.length > 0 && new Date(`${item.date}T00:00:00+05:30`).getTime() - Date.now() > 48 * 60 * 60_000);
  assert.ok(day, 'Verified clinic must expose a future appointment slot');
  const slot = day.slots.find(item => item.doctorId === doctor.id);
  assert.ok(slot, 'Only the verified dentist should have bookable slots');

  const patient = await post('/api/auth/login', { email: patientEmail, password });
  await page.goto(appUrl + '/dentists?treatment=root-canal&location=Noida');
  const bookingLink = page.locator(`a[href^="/dentists/${listingSlug}/book"]`).filter({ hasText: 'Book Appointment' });
  await bookingLink.click();
  await page.getByRole('heading', { name: 'Request an appointment', exact: true }).waitFor();
  await page.getByRole('group', { name: 'Appointment dates' }).getByRole('button').nth(availability.days.indexOf(day)).click();
  await page.locator('app-slot-picker').getByRole('button', { name: /E2E Dentist/ }).first().click();
  await page.locator('#appointment-name').fill('E2E Patient');
  await page.locator('#appointment-phone').fill('9876543210');
  await page.getByText('Reason for visit, email or notes (optional)', { exact: true }).click();
  await page.locator('#appointment-email').fill(patientEmail);
  await page.locator('#appointment-privacyAccepted').check();
  await verifyBookingMobile(page);
  const bookingResponse = page.waitForResponse(response => response.url().endsWith('/api/public/appointments') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Send appointment request', exact: true }).click();
  const booked = { bookingReference: (await (await bookingResponse).json()).bookingRef };
  assert.ok(booked.bookingReference, 'Booking must receive a reference');
  await page.getByRole('heading', { name: 'Your request was sent' }).waitFor();
  await page.getByRole('link', { name: 'View my appointments', exact: true }).click();
  await page.getByText(booked.bookingReference, { exact: true }).waitFor();
  await page.getByRole('heading', { name: 'E2E Clinic' }).waitFor();

  const dentist = await post('/api/auth/professional/signup', {
    email: `dentist-${suffix}@example.test`, password, fullName: 'E2E Video Dentist',
  });
  await patch('/api/providers/me', {
    fullName: 'E2E Video Dentist', qualification: 'BDS', speciality: 'General Dentistry',
    registrationNumber: `E2E-${suffix}`, registrationCouncil: 'Disposable test fixture',
    phoneE164: '+919876543210', languages: ['English'],
  }, dentist.accessToken);
  await post('/api/providers/me/locations', {
    name: 'E2E Video Practice', addressLine1: 'Disposable test address', city: 'Noida',
    locality: 'Noida', consultationFee: 400, acceptingNewPatients: true, schedule,
  }, dentist.accessToken, 201);
  await post('/api/providers/me/submit-verification', {}, dentist.accessToken, 202);
  const provider = await get('/api/providers/me', dentist.accessToken);
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const adminPage = await adminContext.newPage();
  await passwordLogin(adminPage, appUrl + '/platform/login', adminEmail, adminPassword);
  await adminPage.getByRole('heading', { name: 'Clinics', exact: true }).waitFor();
  await adminPage.goto(appUrl + '/business/dentists/verification');
  const verificationCard = adminPage.getByRole('article').filter({ hasText: 'E2E Video Dentist' });
  await verificationCard.getByRole('button', { name: 'Approve and publish', exact: true }).click();
  await adminPage.getByRole('status').filter({ hasText: 'approved and published' }).waitFor();
  assert.equal((await get(`/api/v1/dentists/${provider.slug}`)).dentist.slug, provider.slug,
    'Platform-admin browser approval must publish the submitted dentist');

  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${appUrl}/dentists/${provider.slug}/book?mode=video`);
  await page.getByRole('heading', { name: 'Book a video consultation', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: /In-clinic visit/ }).count(), 0);
  await page.locator('app-slot-picker').getByRole('button', { name: /E2E Video Dentist/ }).first().click();
  await page.getByRole('heading', { name: 'Sign in to continue', exact: true }).waitFor();
  assert.equal(await page.locator('#booking-time-picker').isVisible(), false);
  await page.getByRole('link', { name: 'Sign in or create an account', exact: true }).click();
  await page.waitForURL('**/account?**');
  const bookingReturnUrl = new URL(page.url()).searchParams.get('returnUrl');
  assert.ok(bookingReturnUrl?.includes('doctorId=') && bookingReturnUrl.includes('date=') && bookingReturnUrl.includes('time='), 'Sign-in must preserve the selected booking slot');
  await page.getByRole('textbox', { name: 'Email address' }).fill(patientEmail);
  await page.locator('#auth-password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.locator('#appointment-name').fill('E2E Video Patient');
  await page.locator('#appointment-phone').fill('9876543210');
  await page.getByRole('button', { name: 'Change time', exact: true }).click();
  await page.locator('#booking-time-picker').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#appointment-name').isVisible(), false);
  await page.getByRole('button', { name: 'Keep this time', exact: true }).click();
  assert.equal(await page.locator('#appointment-name').inputValue(), 'E2E Video Patient');
  assert.equal(await page.locator('#appointment-phone').inputValue(), '9876543210');
  await page.locator('#appointment-privacyAccepted').check();
  await verifyBookingMobile(page);
  await page.getByRole('button', { name: 'Send appointment request', exact: true }).click();
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

  // Guest booking -> email challenge -> linked patient account -> reschedule -> cancel.
  await page.setViewportSize({ width: 1440, height: 900 });
  const guestSlot = day.slots.find(item => item.doctorId === doctor.id && item.time !== slot.time);
  assert.ok(guestSlot, 'A second isolated slot is required for the guest-claim journey');
  const guest = await post('/api/public/appointments', {
    clinicId: onboarded.clinicId, bookingRefPrefix: 'E2E', name: 'E2E Guest Claim',
    phone: '9876543211', email: patientEmail, service: 'Guest consultation',
    date: day.date, time: guestSlot.time, doctorId: doctor.id, source: 'marketplace',
    consultationMode: 'in_person',
  });
  await page.goto(appUrl + '/appointments');
  await page.getByText('Add a booking made while signed out', { exact: true }).click();
  await page.locator('#claim-booking-ref').fill(guest.bookingRef);
  await page.getByRole('button', { name: 'Send linking code', exact: true }).click();
  await page.getByText(/sent a linking code/i).waitFor();
  await page.locator('#claim-code').fill(await claimCodeFor(patientEmail));
  await page.getByRole('button', { name: 'Link appointment', exact: true }).click();
  await page.getByText('Appointment linked to your account.', { exact: true }).waitFor();
  const guestCard = page.getByRole('article').filter({ hasText: guest.bookingRef });
  await guestCard.getByText('E2E Clinic', { exact: true }).waitFor();
  await guestCard.getByRole('button', { name: 'Change time', exact: true }).click();
  const timeSelect = guestCard.getByRole('combobox', { name: 'Time' });
  await timeSelect.waitFor();
  await timeSelect.selectOption({ index: 1 });
  await guestCard.getByRole('button', { name: 'Save request', exact: true }).click();
  await guestCard.getByText('Awaiting clinic', { exact: true }).waitFor();
  await guestCard.getByRole('button', { name: 'Cancel', exact: true }).click();
  await guestCard.getByRole('button', { name: 'Yes, cancel', exact: true }).click();
  await guestCard.getByText('Cancelled', { exact: true }).waitFor();

  // Clinic owner confirms and completes the linked appointment through the dashboard.
  const subscriptionId = `sub_E2E${suffix.replaceAll('-', '')}`;
  await sql(`update dental.clinics set subscription_plan = 'starter', subscription_status = 'active',
    updated_at = now() where id = '${onboarded.clinicId}'`);
  await sql(`update dental.clinic_private_accounts set razorpay_subscription_id = '${subscriptionId}',
    billing_config = '{}'::jsonb, updated_at = now() where clinic_id = '${onboarded.clinicId}'`);
  const clinicContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const clinicPage = await clinicContext.newPage();
  await passwordLogin(clinicPage, appUrl + '/business/login', clinicEmail, password);
  await clinicPage.getByText('E2E Clinic', { exact: true }).first().waitFor();
  const appointmentRow = clinicPage.locator('tr').filter({ hasText: 'E2E Patient' });
  await appointmentRow.getByRole('button', { name: 'Confirm', exact: true }).click();
  await appointmentRow.getByText('Confirmed', { exact: true }).waitFor();
  await appointmentRow.getByRole('button', { name: 'Done', exact: true }).click();
  await appointmentRow.getByText('Completed', { exact: true }).waitFor();

  // Completed appointment -> patient review -> platform moderation -> clinic response.
  const reviewText = `E2E verified review ${suffix}`;
  const clinicResponse = `Thank you for the isolated E2E feedback ${suffix}.`;
  await page.reload();
  const completedCard = page.getByRole('article').filter({ hasText: booked.bookingReference });
  await completedCard.getByText('Completed', { exact: true }).waitFor();
  await completedCard.getByRole('button', { name: 'Review visit', exact: true }).click();
  await completedCard.getByPlaceholder('What should other patients know?').fill(reviewText);
  await completedCard.getByRole('button', { name: 'Submit review', exact: true }).click();
  await completedCard.getByText('Awaiting moderation', { exact: true }).waitFor();

  await adminPage.goto(appUrl + '/business/reviews');
  const moderationCard = adminPage.getByRole('article').filter({ hasText: reviewText });
  await moderationCard.getByRole('button', { name: 'Publish', exact: true }).click();
  await moderationCard.waitFor({ state: 'detached' });

  await clinicPage.goto(appUrl + '/business/clinic/reviews');
  const clinicReviewCard = clinicPage.getByRole('article').filter({ hasText: reviewText });
  await clinicReviewCard.getByRole('button', { name: 'Write response', exact: true }).click();
  await clinicReviewCard.getByRole('textbox', { name: 'Clinic response' }).fill(clinicResponse);
  await clinicReviewCard.getByRole('button', { name: 'Publish response', exact: true }).click();
  await clinicReviewCard.getByText(`Your response: ${clinicResponse}`, { exact: true }).waitFor();
  await page.reload();
  await page.getByRole('article').filter({ hasText: booked.bookingReference })
    .getByText(`Clinic response: ${clinicResponse}`, { exact: true }).waitFor();

  // Cancellation UI: confirmation can be backed out, and an unconfigured provider fails safely.
  await clinicPage.goto(appUrl + '/business/clinic/settings?tab=subscription');
  await clinicPage.getByRole('heading', { name: 'Manage subscription', exact: true }).waitFor();
  await clinicPage.getByRole('button', { name: 'Cancel subscription', exact: true }).click();
  await clinicPage.getByText(/Stop renewal at the end of this billing cycle/i).waitFor();
  await clinicPage.getByRole('button', { name: 'Keep plan', exact: true }).click();
  await clinicPage.getByRole('button', { name: 'Cancel subscription', exact: true }).waitFor();
  await clinicPage.getByRole('button', { name: 'Cancel subscription', exact: true }).click();
  await clinicPage.getByRole('button', { name: 'Confirm cancellation', exact: true }).click();
  await clinicPage.getByRole('alert').filter({ hasText: 'Self-service cancellation is unavailable' }).waitFor();

  // All public account types share the same signup form and recovery-code handoff.
  for (const [type, destination] of [['patient', '/appointments'], ['dentist', '/professional/workspace'], ['clinic', '/business/signup']]) {
    const signupPage = await browser.newPage();
    await signupPage.setViewportSize({ width: 390, height: 844 });
    await signupPage.goto(`${appUrl}/account?mode=signup&type=${type}`);
    await signupPage.getByRole('heading', { name: 'Create your account', exact: true }).waitFor();
    if (type === 'dentist') await signupPage.getByRole('textbox', { name: 'Full name', exact: true }).fill('E2E Unified Dentist');
    await signupPage.getByRole('textbox', { name: 'Email address', exact: true }).fill(`unified-${type}-${suffix}@example.test`);
    await signupPage.getByLabel('Password', { exact: true }).fill(password);
    await signupPage.getByLabel('Confirm password', { exact: true }).fill(password);
    await signupPage.getByRole('button', { name: 'Create account', exact: true }).click();
    await signupPage.getByRole('heading', { name: 'Save your recovery code', exact: true }).waitFor();
    await signupPage.getByRole('button', { name: 'I saved my code — continue', exact: true }).waitFor();
    assert.ok((await signupPage.getByRole('textbox', { name: 'Recovery code', exact: true }).inputValue()).length > 0);
    assert.equal(await signupPage.getByRole('button', { name: 'New account', exact: true }).count(), 0);
    await signupPage.getByRole('button', { name: 'I saved my code — continue', exact: true }).click();
    await signupPage.waitForURL(url => url.pathname === destination);
    await signupPage.getByRole('heading').first().waitFor();
    if (type === 'dentist') {
      await signupPage.getByRole('button', { name: 'Complete your profile', exact: true }).waitFor();
      const photoFixture = Buffer.from(await signupPage.evaluate(() => {
        const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32;
        const context = canvas.getContext('2d'); context.fillStyle = '#2563eb'; context.fillRect(0, 0, 32, 32);
        return canvas.toDataURL('image/png').split(',')[1];
      }), 'base64');
      await signupPage.locator('#dentist-photo').setInputFiles({ name: 'test-profile.png', mimeType: 'image/png', buffer: photoFixture });
      await signupPage.getByText('Profile photo saved.', { exact: true }).waitFor();
      await signupPage.reload();
      await signupPage.getByRole('img', { name: 'Your dentist profile photo', exact: true }).waitFor();
      await signupPage.waitForFunction(() => document.querySelector('img[alt="Your dentist profile photo"]')?.naturalWidth === 32);
      await signupPage.getByLabel('Replace photo', { exact: true }).setInputFiles({ name: 'replacement.png', mimeType: 'image/png', buffer: photoFixture });
      await signupPage.getByText('Profile photo saved.', { exact: true }).waitFor();
      await signupPage.getByRole('button', { name: 'Remove photo', exact: true }).click();
      await signupPage.getByText('Profile photo removed.', { exact: true }).waitFor();
      await signupPage.reload();
      await signupPage.getByText('No photo added yet.', { exact: true }).waitFor();
      await signupPage.getByRole('button', { name: 'Hours', exact: true }).click();
      await signupPage.waitForURL('**tab=availability');
      await signupPage.reload();
      await signupPage.getByRole('heading', { name: 'Practice hours', exact: true }).waitFor();
      await signupPage.getByRole('button', { name: 'Profile tab', exact: true }).click();
      await signupPage.waitForURL('**tab=profile');
    }
    if (type === 'clinic') {
      await signupPage.setViewportSize({ width: 390, height: 844 });
      await signupPage.getByRole('heading', { name: 'Set up your clinic', exact: true }).waitFor();
      assert.equal(await signupPage.locator('details').filter({ hasText: 'Website colours (optional)' }).getAttribute('open'), null);
      await signupPage.locator('#signup-clinic-name').fill('E2E Guided Clinic');
      await signupPage.locator('#signup-clinic-phone').fill('9876543210');
      await signupPage.locator('#signup-clinic-slug').fill(`guided${Date.now()}`);
      await signupPage.getByRole('button', { name: 'Continue → Services and hours' }).click();
      await signupPage.getByRole('heading', { name: 'What do you offer?', exact: true }).waitFor();
      assert.ok(await signupPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await signupPage.getByRole('button', { name: 'Choose plan', exact: true }).click();
      await signupPage.getByRole('button', { name: 'Create free clinic workspace', exact: true }).click();
      await signupPage.getByRole('heading', { name: 'Your clinic workspace is ready', exact: true }).waitFor();
      await signupPage.getByRole('link', { name: 'Open dashboard', exact: true }).click();
      await signupPage.waitForURL('**/business/clinic/dashboard');
      assert.equal(new URL(signupPage.url()).origin, new URL(appUrl).origin, 'Clinic onboarding must retain the signed-in platform session');
    }
    console.log(`PASS unified signup: ${type} reaches ${destination}`);
    await signupPage.screenshot({ path: `artifacts/ux-route-checks/journeys/${type}-mobile.png`, fullPage: true });
    await signupPage.close();
  }

  if (process.env.E2E_UX_AUDIT === '1') {
    const guestPage = await browser.newPage();
    const failures = await checkUxRoutes(guestPage, appUrl, 'public', [
      '/', '/book', '/services', '/about', '/gallery', '/testimonials', '/contact', '/appointment',
      '/appointment/confirmed', '/my-appointment', '/privacy', '/terms', '/coming-soon', '/not-a-real-page',
      '/dentists', '/dentists/noida', '/dentists/root-canal/noida', `/dentists/${listingSlug}`,
      `/dentists/${listingSlug}/book`, `/dentist/${provider.slug}`, `/clinic/${listingSlug}`,
      '/workspace', '/business/forgot-password', '/business/reset-password', '/account', '/account?mode=signup', '/account?mode=signup&type=dentist', '/account?mode=signup&type=clinic', '/appointments', '/professional', '/professional/signup', '/professional/login', '/account/recovery',
      '/business', '/business/signup', '/business/login', '/business/privacy', '/business/terms', '/platform/login', '/video-test',
    ]);
    failures.push(...await checkUxRoutes(clinicPage, appUrl, 'clinic', [
      '/workspace', '/business/clinic/dashboard', '/business/clinic/settings', '/business/clinic/settings?tab=subscription',
      ...['contact', 'hours', 'services', 'testimonials', 'social', 'theme', 'logo'].map(tab => `/business/clinic/settings?tab=${tab}`),
      '/business/clinic/doctors', '/business/clinic/patients', '/business/clinic/reviews',
    ]));
    failures.push(...await checkUxRoutes(adminPage, appUrl, 'platform', [
      '/workspace', '/business/patient-requests', '/business/clinics', '/business/clinics/new', `/business/clinics/${onboarded.clinicId}/edit`,
      '/business/dentists/verification', '/business/reviews', '/business/analytics', '/business/revenue',
      '/business/leads', '/business/leads/new', '/business/leads/discover',
    ]));
    const dentistPage = await browser.newPage();
    await passwordLogin(dentistPage, appUrl + '/professional/login', `dentist-${suffix}@example.test`, password);
    await dentistPage.waitForURL('**/professional/workspace**');
    failures.push(...await checkUxRoutes(dentistPage, appUrl, 'dentist', [
      '/workspace', '/professional/workspace?tab=appointments', '/professional/workspace?tab=profile',
      '/professional/workspace?tab=availability', '/professional/profile', '/professional/video-test',
    ]));
    assert.deepEqual(failures, [], 'All UX route checks should pass');
  }
  console.log('PASS Playwright: guest claim, patient reschedule/cancel, clinic confirmation/completion, review moderation/response, provider verification, and subscription cancellation UI.');
  console.log('PASS Playwright: independent video booking form, dentist inbox/confirmation, and patient-account visibility. Media transport is tested separately.');
  console.log('PASS Playwright: unverified exclusion, verified booking, and patient-account visibility against isolated Spring/PostgreSQL.');
} finally {
  await browser.close();
}
