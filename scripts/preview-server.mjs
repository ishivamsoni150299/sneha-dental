import http from 'node:http';
import { URL } from 'node:url';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT || 8080);
const HOST = '127.0.0.1';

// In-memory data store for live testing
const appointments = new Map();
const slotHolds = new Map();
const enquiries = [];
const reviews = [];

// Seed an initial demo appointment for instant lookup testing
const sampleAppointment = {
  id: 'app-demo-001',
  clinicId: 'c_sneha_default',
  lookupKey: 'SD-2026-DEMO',
  bookingRef: 'SD-2026-DEMO',
  name: 'Rahul Sharma',
  phone: '9876543210',
  email: 'rahul.sharma@example.com',
  service: 'Root Canal Treatment',
  date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  time: '10:30 AM',
  doctorId: 'doc-sneha-1',
  doctorName: 'Dr. Sneha Sharma',
  message: 'First time consultation for tooth sensitivity and mild pain.',
  consultationMode: 'in_person',
  status: 'confirmed',
  source: 'clinic_website',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
appointments.set(sampleAppointment.bookingRef, sampleAppointment);
appointments.set(sampleAppointment.id, sampleAppointment);

const sampleDoctors = [
  {
    id: 'doc-sneha-1',
    clinicId: 'c_sneha_default',
    name: 'Dr. Sneha Sharma',
    qualification: 'BDS, MDS (Endodontics)',
    specialization: 'Endodontist & Root Canal Specialist',
    experienceYears: 12,
    consultationFee: 500,
    about: 'Experienced endodontist specializing in painless single-visit root canals and restorative dental care.',
    isAvailable: true,
    availableDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
    availableTime: '10:00 AM - 08:00 PM',
  },
  {
    id: 'doc-arun-2',
    clinicId: 'c_sneha_default',
    name: 'Dr. Arun Verma',
    qualification: 'BDS, MDS (Orthodontics)',
    specialization: 'Orthodontist & Implantologist',
    experienceYears: 9,
    consultationFee: 600,
    about: 'Certified Invisalign provider specializing in clear aligners, ceramic braces, and dental implantology.',
    isAvailable: true,
    availableDays: ['mon', 'wed', 'fri', 'sat'],
    availableTime: '11:00 AM - 07:00 PM',
  },
];

const sampleClinics = [
  {
    id: 'c_sneha_default',
    name: 'Sneha Dental Clinic',
    slug: 'sneha-dental-clinic',
    address: 'Shop 14, Ground Floor, Central Plaza, Sector 75, Noida, UP 201301',
    city: 'Noida',
    locality: 'Sector 75',
    region: 'Delhi NCR',
    phone: '+919876543210',
    whatsapp: '+919876543210',
    rating: 4.9,
    reviewCount: 384,
    consultationFee: 500,
    isOpenNow: true,
    hours: [
      { days: 'Mon - Sat', time: '10:00 AM - 08:00 PM' },
      { days: 'Sun', time: '10:00 AM - 02:00 PM' },
    ],
    services: [
      { id: 'root-canal', name: 'Root Canal Treatment', price: '₹3,500 onwards' },
      { id: 'teeth-whitening', name: 'Teeth Whitening', price: '₹4,000 onwards' },
      { id: 'cleaning-scaling', name: 'Ultrasonic Scaling & Polishing', price: '₹1,200 onwards' },
      { id: 'dental-implants', name: 'Dental Implants', price: '₹25,000 onwards' },
      { id: 'braces-orthodontics', name: 'Braces & Clear Aligners', price: '₹30,000 onwards' },
      { id: 'emergency-dental-care', name: 'Emergency Dental Care', price: '₹500 onwards' },
    ],
    doctors: sampleDoctors,
  },
  {
    id: 'c_delhi_smile',
    name: 'Apex Dental & Implant Centre',
    slug: 'apex-dental-delhi',
    address: 'M-42, Greater Kailash 1, South Delhi, New Delhi 110048',
    city: 'Delhi',
    locality: 'South Delhi',
    region: 'Delhi NCR',
    phone: '+919811223344',
    rating: 4.8,
    reviewCount: 240,
    consultationFee: 800,
    isOpenNow: true,
    hours: [{ days: 'Mon - Sat', time: '09:30 AM - 07:30 PM' }],
    services: [
      { id: 'dental-implants', name: 'Dental Implants', price: '₹28,000 onwards' },
      { id: 'root-canal', name: 'Microscopic RCT', price: '₹4,500 onwards' },
    ],
    doctors: [],
  },
  {
    id: 'c_gurugram_care',
    name: 'Gurugram Smile Studio',
    slug: 'gurugram-smile-studio',
    address: 'DLF Phase 2, MG Road, Gurugram, Haryana 122002',
    city: 'Gurugram',
    locality: 'Cyber City',
    region: 'Delhi NCR',
    phone: '+919922334455',
    rating: 4.9,
    reviewCount: 195,
    consultationFee: 700,
    isOpenNow: true,
    hours: [{ days: 'Mon - Sun', time: '10:00 AM - 08:00 PM' }],
    services: [
      { id: 'braces-orthodontics', name: 'Invisalign Aligners', price: '₹60,000 onwards' },
      { id: 'cleaning-scaling', name: 'Deep Laser Cleaning', price: '₹1,500 onwards' },
    ],
    doctors: [],
  },
];

function sendJson(res, statusCode, data) {
  const json = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  });
  res.end(json);
}

function sendNoContent(res) {
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  });
  res.end();
}

async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 1e6) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || HOST}`);
  const path = parsedUrl.pathname;
  const method = req.method.toUpperCase();

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    });
    res.end();
    return;
  }

  try {
    // ── Health Check ──────────────────────────────────────────────────────────
    if (path === '/api/health' && method === 'GET') {
      return sendJson(res, 200, {
        status: 'ok',
        db: 'up',
        service: 'preview-backend',
        timestamp: new Date().toISOString(),
      });
    }

    // ── Clinic Resolve ────────────────────────────────────────────────────────
    if (path === '/api/public/clinics/resolve' && method === 'GET') {
      const host = parsedUrl.searchParams.get('host') || 'localhost';
      return sendJson(res, 200, {
        clinicId: 'c_sneha_default',
        id: 'c_sneha_default',
        name: 'Sneha Dental Clinic',
        tagline: 'Gentle, pain-free dental care with modern technology',
        bookingRefPrefix: 'SD',
        theme: 'blue',
        phone: '+91 98765 43210',
        whatsapp: '+919876543210',
        email: 'care@snehadental.com',
        address: 'Shop 14, Ground Floor, Central Plaza, Sector 75, Noida, UP 201301',
        googleMapsUrl: 'https://maps.google.com/?q=Noida+Sector+75',
        hours: [
          { days: 'Mon - Sat', time: '10:00 AM - 08:00 PM' },
          { days: 'Sun', time: '10:00 AM - 02:00 PM' },
        ],
        subscriptionPlan: 'pro',
        subscriptionStatus: 'active',
      });
    }

    // ── Doctors List ──────────────────────────────────────────────────────────
    if (path.startsWith('/api/public/clinics/') && path.endsWith('/doctors') && method === 'GET') {
      return sendJson(res, 200, sampleDoctors);
    }
    if (path === '/api/clinics/current/doctors' && method === 'GET') {
      return sendJson(res, 200, sampleDoctors);
    }

    // ── Slot Hold ─────────────────────────────────────────────────────────────
    if (path === '/api/public/appointments/hold-slot' && method === 'POST') {
      const body = await parseBody(req);
      const holdToken = `hold_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      slotHolds.set(holdToken, { ...body, holdToken, expiresAt });
      console.log(`[Preview API] Slot hold created for ${body.date} ${body.time}: ${holdToken}`);
      return sendJson(res, 200, { holdToken, expiresAt });
    }

    if (path.startsWith('/api/public/appointments/hold-slot/') && method === 'DELETE') {
      const token = decodeURIComponent(path.replace('/api/public/appointments/hold-slot/', ''));
      slotHolds.delete(token);
      console.log(`[Preview API] Slot hold released: ${token}`);
      return sendNoContent(res);
    }

    // ── Book Appointment ──────────────────────────────────────────────────────
    if (path === '/api/public/appointments' && method === 'POST') {
      const body = await parseBody(req);
      const prefix = body.bookingRefPrefix || 'SD';
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const randomChars = crypto.randomBytes(2).toString('hex').toUpperCase();
      const bookingRef = `${prefix}-${randomSuffix}-${randomChars}`;
      const id = `app_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

      const appointment = {
        id,
        clinicId: body.clinicId || 'c_sneha_default',
        lookupKey: bookingRef,
        bookingRef,
        name: body.name || 'Anonymous Patient',
        phone: String(body.phone || '').replace(/\D/g, '').slice(-10),
        email: body.email || '',
        service: body.service || 'General Dentistry',
        date: body.date,
        time: body.time,
        doctorId: body.doctorId || null,
        doctorName: body.doctorName || (body.doctorId ? 'Dr. Sneha Sharma' : null),
        message: body.message || '',
        consultationMode: body.consultationMode || 'in_person',
        source: body.source || 'clinic_website',
        status: 'pending',
        confirmationDeadline: body.confirmationDeadline || new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      appointments.set(bookingRef, appointment);
      appointments.set(id, appointment);
      if (body.holdToken) slotHolds.delete(body.holdToken);

      console.log(`[Preview API] Successfully booked appointment: ${bookingRef} (${appointment.name}, ${appointment.service})`);
      return sendJson(res, 200, { bookingRef });
    }

    // ── Lookup Appointment ────────────────────────────────────────────────────
    if (path === '/api/public/appointments/lookup' && method === 'GET') {
      const bookingRef = (parsedUrl.searchParams.get('bookingRef') || '').trim().toUpperCase();
      const phone = (parsedUrl.searchParams.get('phone') || '').replace(/\D/g, '').slice(-10);

      const found = appointments.get(bookingRef);
      if (found && (!phone || found.phone.endsWith(phone))) {
        return sendJson(res, 200, found);
      }

      // If looking up with a valid format, generate or fallback gracefully
      if (bookingRef.includes('-') && phone.length === 10) {
        const synthetic = {
          id: `app_${bookingRef}`,
          clinicId: 'c_sneha_default',
          lookupKey: bookingRef,
          bookingRef,
          name: 'Verified Patient',
          phone,
          service: 'Dental Consultation',
          date: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().split('T')[0],
          time: '11:00 AM',
          status: 'confirmed',
          doctorName: 'Dr. Sneha Sharma',
          consultationMode: 'in_person',
          createdAt: new Date().toISOString(),
        };
        appointments.set(bookingRef, synthetic);
        return sendJson(res, 200, synthetic);
      }

      return sendJson(res, 404, { detail: 'Appointment not found. Please check your booking code and phone number.' });
    }

    if (path === '/api/public/appointments/lookup-any' && method === 'POST') {
      const body = await parseBody(req);
      const bookingRef = (body.bookingRef || '').trim().toUpperCase();
      const phone = (body.phone || '').replace(/\D/g, '').slice(-10);

      const found = appointments.get(bookingRef);
      if (found) return sendJson(res, 200, found);

      const synthetic = {
        id: `app_${bookingRef}`,
        clinicId: 'c_sneha_default',
        lookupKey: bookingRef,
        bookingRef,
        name: 'Verified Patient',
        phone: phone || '9876543210',
        service: 'Dental Consultation',
        date: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().split('T')[0],
        time: '11:00 AM',
        status: 'confirmed',
        doctorName: 'Dr. Sneha Sharma',
        consultationMode: 'in_person',
        createdAt: new Date().toISOString(),
      };
      appointments.set(bookingRef, synthetic);
      return sendJson(res, 200, synthetic);
    }

    // ── Reschedule / Update Appointment ───────────────────────────────────────
    if (path.startsWith('/api/public/appointments/') && !path.includes('/cancel') && !path.includes('/review') && method === 'PATCH') {
      const id = decodeURIComponent(path.replace('/api/public/appointments/', ''));
      const body = await parseBody(req);
      const app = appointments.get(id);
      if (app) {
        if (body.date) app.date = body.date;
        if (body.time) app.time = body.time;
        if (body.service) app.service = body.service;
        if (body.message) app.message = body.message;
        app.updatedAt = new Date().toISOString();
        console.log(`[Preview API] Rescheduled appointment ${app.bookingRef} to ${app.date} ${app.time}`);
      }
      return sendNoContent(res);
    }

    // ── Cancel Appointment ────────────────────────────────────────────────────
    if (path.startsWith('/api/public/appointments/') && path.endsWith('/cancel') && method === 'POST') {
      const parts = path.split('/');
      const id = decodeURIComponent(parts[parts.length - 2]);
      const app = appointments.get(id);
      if (app) {
        app.status = 'cancelled';
        app.updatedAt = new Date().toISOString();
        console.log(`[Preview API] Cancelled appointment ${app.bookingRef}`);
      }
      return sendNoContent(res);
    }

    // ── Review Appointment ────────────────────────────────────────────────────
    if (path.startsWith('/api/public/appointments/') && path.endsWith('/review') && method === 'POST') {
      const body = await parseBody(req);
      reviews.push(body);
      return sendJson(res, 200, { success: true, message: 'Review received. Thank you!' });
    }

    // ── Contact Enquiries ─────────────────────────────────────────────────────
    if (path === '/api/public/enquiries' && method === 'POST') {
      const body = await parseBody(req);
      const id = `enq_${Date.now()}`;
      enquiries.push({ id, ...body, createdAt: new Date().toISOString() });
      console.log(`[Preview API] Received enquiry from ${body.name || body.phone}`);
      return sendJson(res, 200, { id, status: 'received' });
    }

    // ── Marketplace Clinics ───────────────────────────────────────────────────
    if (path === '/api/marketplace/clinics' && method === 'GET') {
      const region = parsedUrl.searchParams.get('region');
      const filtered = region
        ? sampleClinics.filter(c => c.city.toLowerCase().includes(region.toLowerCase()) || c.locality.toLowerCase().includes(region.toLowerCase()))
        : sampleClinics;
      return sendJson(res, 200, filtered);
    }

    // ── Auth: OTP Request & Verify ────────────────────────────────────────────
    if (path === '/api/auth/otp/request' && method === 'POST') {
      const body = await parseBody(req);
      console.log(`[Preview API] OTP requested for ${body.identity} (portal: ${body.portal}) -> Demo Code: 123456`);
      return sendJson(res, 200, { success: true, message: 'OTP sent to mobile number' });
    }

    if (path === '/api/auth/otp/verify' && method === 'POST') {
      const body = await parseBody(req);
      console.log(`[Preview API] OTP verified for ${body.identity}`);
      return sendJson(res, 200, {
        accessToken: `jwt_token_${crypto.randomBytes(16).toString('hex')}`,
        expiresIn: 3600,
        user: {
          id: 'patient-test-uid',
          clinicId: null,
          role: 'patient',
          phoneNumber: body.identity,
          phoneVerified: true,
        },
      });
    }

    // ── Auth: Login & Refresh ─────────────────────────────────────────────────
    if (path === '/api/auth/login' && method === 'POST') {
      const body = await parseBody(req);
      return sendJson(res, 200, {
        accessToken: `jwt_token_${crypto.randomBytes(16).toString('hex')}`,
        expiresIn: 3600,
        user: {
          id: 'usr-admin-demo',
          clinicId: 'c_sneha_default',
          role: 'clinic-admin',
          email: body.email || 'admin@snehadental.com',
          emailVerified: true,
        },
      });
    }

    if (path === '/api/auth/refresh' && method === 'POST') {
      // Default to guest if no existing session
      return sendJson(res, 401, { message: 'No active session' });
    }

    if (path === '/api/auth/logout' && method === 'POST') {
      return sendJson(res, 200, { ok: true });
    }

    // ── Patient Session ───────────────────────────────────────────────────────
    if (path === '/api/patient/session' && method === 'GET') {
      const list = [...appointments.values()].filter(a => a.status !== 'cancelled');
      return sendJson(res, 200, {
        profile: { phoneMasked: '+91 ••••••4321' },
        appointments: list,
      });
    }

    // ── Current Clinic Info & Appointments (Admin/Doctor portal) ──────────────
    if (path === '/api/clinics/current' && method === 'GET') {
      return sendJson(res, 200, sampleClinics[0]);
    }
    if (path === '/api/clinics/current/appointments' && method === 'GET') {
      return sendJson(res, 200, [...appointments.values()]);
    }
    if (path === '/api/clinics/current/contacts' && method === 'GET') {
      return sendJson(res, 200, enquiries);
    }

    // ── Fallback 404 for unhandled API routes ─────────────────────────────────
    console.warn(`[Preview API] 404 Unhandled: ${method} ${path}`);
    return sendJson(res, 404, { error: 'Not found', path });

  } catch (err) {
    console.error(`[Preview API] 500 Error: ${err.message}`);
    return sendJson(res, 500, { error: 'Internal server error', detail: err.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`=======================================================`);
  console.log(` My Dental Platform — Mock Preview API Server`);
  console.log(` Listening on http://${HOST}:${PORT}`);
  console.log(` Demo fixtures only; data resets on restart. No real authentication or integrations.`);
  console.log(`=======================================================`);
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
