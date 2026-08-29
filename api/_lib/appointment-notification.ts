import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'crypto';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { sendEmail } from '../../lib/server/send-email';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env['FIREBASE_PROJECT_ID'],
      clientEmail: process.env['FIREBASE_CLIENT_EMAIL'],
      privateKey: process.env['FIREBASE_PRIVATE_KEY']?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();
const WINDOW_MS = 10 * 60_000;
const MAX_REQUESTS = 12;

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function normalizeBookingRef(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, '').slice(-10);
}

function lookupKey(clinicId: string, bookingRef: string, phone: string): string {
  const source = [clinicId.trim(), normalizeBookingRef(bookingRef), normalizePhone(phone)].join('__');
  return createHash('sha256').update(source).digest('hex');
}

function requestIp(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  return (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim()
    || req.socket.remoteAddress
    || 'unknown';
}

async function isRateLimited(ip: string): Promise<boolean> {
  const bucket = Math.floor(Date.now() / WINDOW_MS);
  const id = createHash('sha256').update(`appointment-notification:${ip}:${bucket}`).digest('hex');
  const ref = db.collection('rateLimits').doc(`appointment_notification_${id}`);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const count = Number(snap.data()?.['count'] ?? 0);
    if (count >= MAX_REQUESTS) return true;
    tx.set(ref, {
      type: 'appointment-notification',
      count: count + 1,
      expiresAt: new Date((bucket + 2) * WINDOW_MS),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return false;
  });
}

function hostname(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-host'];
  const host = Array.isArray(forwarded) ? forwarded[0] : forwarded || req.headers.host || '';
  return host.split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');
}

function hostMatchesClinic(host: string, clinic: Record<string, unknown>): boolean {
  if (host === 'localhost' || host === '127.0.0.1') return process.env['VERCEL_ENV'] !== 'production';
  const allowed = [clinic['domain'], clinic['vercelDomain']]
    .filter((value): value is string => typeof value === 'string')
    .map(value => value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''));
  return allowed.includes(host);
}

export async function sendAppointmentNotification(req: VercelRequest, res: VercelResponse): Promise<VercelResponse> {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (await isRateLimited(requestIp(req))) {
    return res.status(429).json({ error: 'Too many requests. Please wait and try again.' });
  }

  const clinicId = clean(req.body?.clinicId, 128);
  const bookingRef = clean(req.body?.bookingRef, 32);
  const phone = clean(req.body?.phone, 24);
  if (!clinicId || normalizeBookingRef(bookingRef).length < 6 || normalizePhone(phone).length !== 10) {
    return res.status(400).json({ error: 'Invalid booking details.' });
  }

  const clinicRef = db.collection('clinics').doc(clinicId);
  const [clinicSnap, appointmentSnap] = await Promise.all([
    clinicRef.get(),
    db.collection('appointments').doc(lookupKey(clinicId, bookingRef, phone)).get(),
  ]);
  if (!clinicSnap.exists || !appointmentSnap.exists) {
    return res.status(404).json({ error: 'Booking not found.' });
  }

  const clinic = clinicSnap.data() ?? {};
  const appointment = appointmentSnap.data() ?? {};
  if (clinic['active'] !== true || appointment['clinicId'] !== clinicId || !hostMatchesClinic(hostname(req), clinic)) {
    return res.status(403).json({ error: 'Request is not allowed for this clinic.' });
  }

  const notificationRef = db.collection('notifications').doc(`appointment_${appointmentSnap.id}`);
  const reserved = await db.runTransaction(async tx => {
    const current = await tx.get(notificationRef);
    if (current.data()?.['status'] === 'sent' || current.data()?.['status'] === 'processing') return false;
    tx.set(notificationRef, {
      clinicId,
      appointmentId: appointmentSnap.id,
      status: 'processing',
      attempts: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return true;
  });
  if (!reserved) return res.status(200).json({ ok: true, duplicate: true });

  try {
    const privateSnap = await clinicRef.collection('private').doc('account').get();
    const privateAccount = privateSnap.data() ?? {};
    const clinicEmail = clean(privateAccount['adminEmail'] || privateAccount['billingEmail'], 254);
    const patientEmail = clean(appointment['email'], 254);
    const data = {
      clinicName: clean(clinic['name'], 120) || 'Dental clinic',
      patientName: clean(appointment['name'], 120) || 'Patient',
      patientPhone: clean(appointment['phone'], 24),
      bookingRef: clean(appointment['bookingRef'], 32),
      service: clean(appointment['service'], 160),
      date: clean(appointment['date'], 20),
      time: clean(appointment['time'], 30),
      message: clean(appointment['message'], 1000),
      phone: clean(clinic['phone'], 24),
      dashboardUrl: 'https://www.mydentalplatform.com/business/clinic/dashboard',
    };

    if (!clinicEmail) throw new Error('Clinic notification email is not configured.');
    await sendEmail('clinic_booking_alert', clinicEmail, data);
    if (patientEmail) {
      await sendEmail('appointment_request_received', patientEmail, data).catch(error => {
        console.warn('[appointment-notification] Patient receipt failed:', error);
      });
    }

    await notificationRef.set({ status: 'sent', sentAt: FieldValue.serverTimestamp() }, { merge: true });
    return res.status(200).json({ ok: true });
  } catch (error) {
    await notificationRef.set({ status: 'failed', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    console.error('[appointment-notification] Delivery failed:', error);
    return res.status(503).json({ error: 'Booking was saved, but the clinic notification could not be delivered.' });
  }
}
