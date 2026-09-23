// Mock-preview contract checks against Angular and scripts/preview-server.mjs.
// These fixtures do not exercise Spring, PostgreSQL, authentication or real providers.
import assert from 'node:assert/strict';

const BASE_URL = 'http://127.0.0.1:4200';

async function testSuite() {
  console.log('--- MOCK PREVIEW CHECKS ON ' + BASE_URL + ' ---\n');
  console.log('Use npm run verify for the real Spring/PostgreSQL integration tests.\n');

  let passed = 0;
  let failed = 0;

  async function check(name, fn) {
    process.stdout.write(`Testing: ${name}... `);
    try {
      await fn();
      console.log('✅ PASS');
      passed++;
    } catch (err) {
      console.log('❌ FAIL:', err.message);
      failed++;
    }
  }

  // 1. Health endpoint via proxy
  await check('GET /api/health (Proxy check)', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    assert.equal(res.status, 200, `Expected status 200 but got ${res.status}`);
    const data = await res.json();
    assert.equal(data.status, 'ok');
  });

  // 2. Resolve clinic config
  await check('GET /api/public/clinics/resolve', async () => {
    const res = await fetch(`${BASE_URL}/api/public/clinics/resolve?host=localhost`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.name, 'Sneha Dental Clinic');
  });

  // 3. Doctors list
  await check('GET /api/public/clinics/c_sneha_default/doctors', async () => {
    const res = await fetch(`${BASE_URL}/api/public/clinics/c_sneha_default/doctors`);
    assert.equal(res.status, 200);
    const docs = await res.json();
    assert(Array.isArray(docs));
    assert(docs.length >= 2);
  });

  // 4. Hold Slot (Step 1 in Appointment flow)
  let holdToken = '';
  await check('POST /api/public/appointments/hold-slot', async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const res = await fetch(`${BASE_URL}/api/public/appointments/hold-slot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clinicId: 'c_sneha_default',
        doctorId: 'doc-sneha-1',
        date: tomorrow,
        time: '11:00 AM'
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert(data.holdToken);
    assert(data.expiresAt);
    holdToken = data.holdToken;
  });

  // 5. Release hold slot
  await check('DELETE /api/public/appointments/hold-slot/:token', async () => {
    const res = await fetch(`${BASE_URL}/api/public/appointments/hold-slot/${encodeURIComponent(holdToken)}`, {
      method: 'DELETE'
    });
    assert.equal(res.status, 204);
  });

  // 6. Complete appointment booking (Step 3 in Appointment flow)
  let createdBookingRef = '';
  let appointmentDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  await check('POST /api/public/appointments (Book Appointment)', async () => {
    const res = await fetch(`${BASE_URL}/api/public/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clinicId: 'c_sneha_default',
        bookingRefPrefix: 'SD',
        name: 'Pooja Verma',
        phone: '9876543211',
        email: 'pooja.verma@example.com',
        service: 'Teeth Whitening',
        date: appointmentDate,
        time: '02:30 PM',
        message: 'Looking for laser teeth whitening consultation.',
        consultationMode: 'in_person'
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert(data.bookingRef, 'Must return bookingRef');
    assert(data.bookingRef.startsWith('SD-'));
    createdBookingRef = data.bookingRef;
  });

  // 7. Lookup the booked appointment (/my-appointment flow)
  await check('GET /api/public/appointments/lookup', async () => {
    const res = await fetch(`${BASE_URL}/api/public/appointments/lookup?clinicId=c_sneha_default&bookingRef=${createdBookingRef}&phone=9876543211`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.bookingRef, createdBookingRef);
    assert.equal(data.name, 'Pooja Verma');
    assert.equal(data.service, 'Teeth Whitening');
  });

  // 8. Reschedule appointment
  await check('PATCH /api/public/appointments/:id (Reschedule)', async () => {
    const newDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const res = await fetch(`${BASE_URL}/api/public/appointments/${createdBookingRef}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: newDate,
        time: '04:00 PM'
      })
    });
    assert.equal(res.status, 204);
  });

  // 9. Submit contact enquiry (/contact flow)
  await check('POST /api/public/enquiries (Contact Enquiry)', async () => {
    const res = await fetch(`${BASE_URL}/api/public/enquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clinicId: 'c_sneha_default',
        name: 'Amit Patel',
        phone: '9988776655',
        message: 'Inquiring about full mouth dental implants.'
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert(data.id);
  });

  // 10. Marketplace Clinics Search
  await check('GET /api/marketplace/clinics?region=Delhi', async () => {
    const res = await fetch(`${BASE_URL}/api/marketplace/clinics?region=Delhi`);
    assert.equal(res.status, 200);
    const list = await res.json();
    assert(Array.isArray(list));
    assert(list.length > 0);
  });

  // 11. OTP Auth Request & Verify
  await check('POST /api/auth/otp/request & verify', async () => {
    const reqRes = await fetch(`${BASE_URL}/api/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: '+919876543210', portal: 'patient' })
    });
    assert.equal(reqRes.status, 200);

    const verRes = await fetch(`${BASE_URL}/api/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: '+919876543210', portal: 'patient', code: '123456' })
    });
    assert.equal(verRes.status, 200);
    const verData = await verRes.json();
    assert.equal(verData.user.role, 'patient');
  });

  // 12. Frontend Pages HTML & App-Root Presence
  const frontendPages = [
    '/',
    '/services',
    '/about',
    '/appointment',
    '/gallery',
    '/testimonials',
    '/contact',
    '/my-appointment',
    '/dentists',
    '/professional'
  ];

  for (const page of frontendPages) {
    await check(`GET ${page} (Frontend Shell Render)`, async () => {
      const res = await fetch(`${BASE_URL}${page}`);
      assert.equal(res.status, 200, `Route ${page} returned status ${res.status}`);
      const text = await res.text();
      assert(text.includes('<app-root'), `Route ${page} missing <app-root>`);
    });
  }

  console.log(`\n========================================`);
  console.log(` SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

testSuite();
