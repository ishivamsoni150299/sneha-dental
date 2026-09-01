import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'crypto';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type DocumentSnapshot } from 'firebase-admin/firestore';
import { buildAppointmentSlotId } from './_lib/marketplace-appointment-policy';
import {
  canClaimPatientAppointment,
  canPatientCancelAppointment,
  canPatientManageAppointment,
  calculatePatientConfirmationDeadline,
  normalizePatientBookingRef,
  normalizePatientReschedule,
  isPatientRescheduleSlotAllowed,
  patientRescheduleSlotsForDate,
  toPatientAppointmentDto,
  verifiedPatientIdentity,
  type PatientAppointmentRecord,
  type PatientIdentity,
} from './_lib/patient-appointment-policy';

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
const RATE_WINDOW_MS = 10 * 60_000;
const MAX_LIST_REQUESTS = 60;
const MAX_CLAIM_REQUESTS = 8;
const MAX_MUTATION_REQUESTS = 20;

type PatientAction = 'session' | 'claim' | 'cancel' | 'availability' | 'reschedule';
type VerifiedIdentity = { uid: string; phoneE164: string };

class PatientApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function bearerToken(req: VercelRequest): string {
  const authorization = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization;
  return authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
}

function requestedAction(req: VercelRequest): PatientAction | null {
  const action = Array.isArray(req.query['action']) ? req.query['action'][0] : req.query['action'];
  return ['session', 'claim', 'cancel', 'availability', 'reschedule'].includes(action ?? '')
    ? action as PatientAction
    : null;
}

function validAppointmentId(value: unknown): string | null {
  const id = clean(value, 128);
  return /^[A-Za-z0-9_-]{16,128}$/.test(id) ? id : null;
}

function maskPhone(phoneE164: string): string {
  return `${phoneE164.slice(0, 3)} ••••••${phoneE164.slice(-4)}`;
}

async function authenticate(req: VercelRequest): Promise<VerifiedIdentity> {
  const token = bearerToken(req);
  if (!token) throw new PatientApiError(401, 'Phone verification is required.');
  try {
    const decoded = await getAuth().verifyIdToken(token);
    const identity = verifiedPatientIdentity(decoded as PatientIdentity);
    if (!identity) throw new PatientApiError(403, 'Sign in with a verified mobile number to continue.');
    return identity;
  } catch (error) {
    if (error instanceof PatientApiError) throw error;
    throw new PatientApiError(401, 'Your patient session has expired. Please verify your number again.');
  }
}

async function enforceRateLimit(identity: VerifiedIdentity, action: PatientAction): Promise<void> {
  const bucket = Math.floor(Date.now() / RATE_WINDOW_MS);
  const scope = action === 'session' || action === 'availability' ? 'list' : action;
  const limit = action === 'session' || action === 'availability'
    ? MAX_LIST_REQUESTS
    : action === 'claim' ? MAX_CLAIM_REQUESTS : MAX_MUTATION_REQUESTS;
  const digest = createHash('sha256')
    .update(`patient-api:${identity.uid}:${identity.phoneE164}:${scope}:${bucket}`)
    .digest('hex');
  const ref = db.collection('rateLimits').doc(`patient_api_${digest}`);
  const limited = await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const count = Number(snapshot.data()?.['count'] ?? 0);
    if (count >= limit) return true;
    transaction.set(ref, {
      type: 'patient-api',
      scope,
      count: count + 1,
      expiresAt: new Date((bucket + 2) * RATE_WINDOW_MS),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return false;
  });
  if (limited) throw new PatientApiError(429, 'Too many requests. Please wait a few minutes and try again.');
}

async function ensurePatientProfile(identity: VerifiedIdentity, displayName = ''): Promise<void> {
  const ref = db.collection('patients').doc(identity.uid);
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) {
      transaction.create(ref, {
        phoneE164: identity.phoneE164,
        displayName: clean(displayName, 120),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return;
    }
    const existingName = clean(snapshot.data()?.['displayName'], 120);
    transaction.update(ref, {
      phoneE164: identity.phoneE164,
      ...(existingName || !displayName ? {} : { displayName: clean(displayName, 120) }),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

function appointmentRecord(snapshot: DocumentSnapshot): PatientAppointmentRecord {
  return { id: snapshot.id, ...(snapshot.data() ?? {}) };
}

async function clinicRecords(appointments: PatientAppointmentRecord[]): Promise<Map<string, Record<string, unknown>>> {
  const clinicIds = [...new Set(appointments.map(appointment => clean(appointment.clinicId, 128)).filter(Boolean))];
  const clinics = await Promise.all(clinicIds.map(async clinicId => {
    const snapshot = await db.collection('clinics').doc(clinicId).get();
    return [clinicId, snapshot.data() ?? {}] as const;
  }));
  return new Map(clinics);
}

async function safeAppointments(appointments: PatientAppointmentRecord[]) {
  const clinics = await clinicRecords(appointments);
  return appointments.map(appointment => toPatientAppointmentDto(
    appointment,
    clinics.get(clean(appointment.clinicId, 128)) ?? {},
  ));
}

async function listAppointments(identity: VerifiedIdentity) {
  const snapshot = await db.collection('appointments')
    .where('patientUid', '==', identity.uid)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();
  const appointments = snapshot.docs
    .map(appointmentRecord)
    .filter(appointment => canClaimPatientAppointment(appointment, identity));
  return safeAppointments(appointments);
}

async function claimAppointment(identity: VerifiedIdentity, bookingRefValue: unknown) {
  const bookingRef = normalizePatientBookingRef(bookingRefValue);
  if (!bookingRef) throw new PatientApiError(400, 'Enter a valid booking reference.');

  const candidates = await db.collection('appointments')
    .where('bookingRef', '==', bookingRef)
    .limit(5)
    .get();
  const matches = candidates.docs.filter(snapshot =>
    canClaimPatientAppointment(appointmentRecord(snapshot), identity),
  );
  if (matches.length === 0) {
    throw new PatientApiError(404, 'No appointment matched that reference and verified phone number.');
  }
  if (matches.length > 1) {
    throw new PatientApiError(409, 'More than one booking matched. Please contact support.');
  }

  const ref = matches[0].ref;
  const claimed = await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const appointment = appointmentRecord(snapshot);
    if (!snapshot.exists || !canClaimPatientAppointment(appointment, identity)) {
      throw new PatientApiError(409, 'This appointment can no longer be linked.');
    }
    if (!clean(appointment.patientUid, 128)) {
      transaction.update(ref, {
        patientUid: identity.uid,
        phoneE164: identity.phoneE164,
        claimedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    return appointment;
  });
  await ensurePatientProfile(identity, clean(claimed.name, 120));
  return (await safeAppointments([{ ...claimed, patientUid: identity.uid }]))[0];
}

async function cancelAppointment(identity: VerifiedIdentity, appointmentIdValue: unknown) {
  const appointmentId = validAppointmentId(appointmentIdValue);
  if (!appointmentId) throw new PatientApiError(400, 'Invalid appointment.');
  const appointmentRef = db.collection('appointments').doc(appointmentId);
  const updated = await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(appointmentRef);
    const appointment = appointmentRecord(snapshot);
    if (!snapshot.exists || !canPatientManageAppointment(appointment, identity)) {
      throw new PatientApiError(404, 'This appointment is unavailable.');
    }
    if (!canPatientCancelAppointment(appointment, identity)) {
      throw new PatientApiError(409, 'Online cancellation closes 24 hours before the appointment. Please call the clinic.');
    }
    const slotRef = db.collection('slots').doc(buildAppointmentSlotId(appointment));
    const slot = await transaction.get(slotRef);
    if (slot.exists && slot.data()?.['appointmentId'] === appointmentId) transaction.delete(slotRef);
    transaction.update(appointmentRef, {
      status: 'cancelled',
      cancellationActor: 'patient',
      cancellationReason: 'Cancelled by patient.',
      cancelledAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ...appointment, status: 'cancelled', cancellationActor: 'patient' };
  });
  return (await safeAppointments([updated]))[0];
}

async function appointmentAvailability(
  identity: VerifiedIdentity,
  appointmentIdValue: unknown,
  dateValue: unknown,
): Promise<string[]> {
  const appointmentId = validAppointmentId(appointmentIdValue);
  const date = clean(dateValue, 10);
  if (!appointmentId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new PatientApiError(400, 'Choose a valid date.');
  }
  const snapshot = await db.collection('appointments').doc(appointmentId).get();
  const appointment = appointmentRecord(snapshot);
  if (!snapshot.exists || !canPatientManageAppointment(appointment, identity)) {
    throw new PatientApiError(404, 'This appointment is unavailable.');
  }
  const clinicId = clean(appointment.clinicId, 128);
  const doctorId = clean(appointment.doctorId, 128);
  if (!clinicId || clinicId.includes('/') || doctorId.includes('/')) {
    throw new PatientApiError(409, 'The clinic schedule is unavailable. Please call the clinic.');
  }
  const [clinic, doctor] = await Promise.all([
    db.collection('clinics').doc(clinicId).get(),
    doctorId ? db.collection('clinics').doc(clinicId).collection('doctors').doc(doctorId).get() : null,
  ]);
  if (!clinic.exists || (doctorId && !doctor?.exists)) return [];

  const slots = patientRescheduleSlotsForDate(date, clinic.data() ?? {}, doctor?.data());
  if (!slots.length) return [];
  const slotRefs = slots.map(time => db.collection('slots').doc(buildAppointmentSlotId({
    ...appointment,
    date,
    time,
  })));
  const reserved = await db.getAll(...slotRefs);
  return slots.filter((_, index) => {
    const slot = reserved[index];
    return !slot?.exists || slot.data()?.['appointmentId'] === appointmentId;
  });
}

async function rescheduleAppointment(
  identity: VerifiedIdentity,
  appointmentIdValue: unknown,
  dateValue: unknown,
  timeValue: unknown,
) {
  const appointmentId = validAppointmentId(appointmentIdValue);
  const schedule = normalizePatientReschedule(dateValue, timeValue);
  if (!appointmentId || !schedule) throw new PatientApiError(400, 'Choose a valid future date and time.');
  const appointmentRef = db.collection('appointments').doc(appointmentId);
  const updated = await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(appointmentRef);
    const appointment = appointmentRecord(snapshot);
    if (!snapshot.exists || !canPatientManageAppointment(appointment, identity)) {
      throw new PatientApiError(404, 'This appointment is unavailable.');
    }
    const clinic = await transaction.get(
      db.collection('clinics').doc(clean(appointment.clinicId, 128)),
    );
    const doctorId = clean(appointment.doctorId, 128);
    const doctor = doctorId && !doctorId.includes('/')
      ? await transaction.get(db.collection('clinics').doc(clean(appointment.clinicId, 128)).collection('doctors').doc(doctorId))
      : null;
    if (!clinic.exists || (doctorId && !doctor?.exists) || !isPatientRescheduleSlotAllowed(
      schedule.date,
      schedule.time,
      clinic.data() ?? {},
      doctor?.data(),
    )) {
      throw new PatientApiError(409, 'That time is outside the clinic or dentist schedule. Please choose another slot.');
    }
    const currentSlotRef = db.collection('slots').doc(buildAppointmentSlotId(appointment));
    const nextAppointment = { ...appointment, date: schedule.date, time: schedule.time };
    const nextSlotRef = db.collection('slots').doc(buildAppointmentSlotId(nextAppointment));
    const slotChanged = currentSlotRef.id !== nextSlotRef.id;
    const [currentSlot, nextSlot] = slotChanged
      ? await Promise.all([transaction.get(currentSlotRef), transaction.get(nextSlotRef)])
      : [await transaction.get(currentSlotRef), null];
    if (nextSlot?.exists && nextSlot.data()?.['appointmentId'] !== appointmentId) {
      throw new PatientApiError(409, 'That time was just taken. Please choose another slot.');
    }
    if (slotChanged) {
      if (currentSlot.exists && currentSlot.data()?.['appointmentId'] === appointmentId) {
        transaction.delete(currentSlotRef);
      }
      transaction.set(nextSlotRef, {
        clinicId: clean(appointment.clinicId, 128),
        doctorId: clean(appointment.doctorId, 128) || null,
        date: schedule.date,
        time: schedule.time,
        appointmentId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    transaction.update(appointmentRef, {
      date: schedule.date,
      time: schedule.time,
      status: 'pending',
      ...(appointment.source === 'marketplace' ? {
        confirmationDeadline: calculatePatientConfirmationDeadline(clinic.data()?.['hours']),
      } : {}),
      confirmationRespondedAt: FieldValue.delete(),
      confirmationResponseMinutes: FieldValue.delete(),
      confirmationSlaMissed: FieldValue.delete(),
      confirmedAt: FieldValue.delete(),
      declinedAt: FieldValue.delete(),
      expiredAt: FieldValue.delete(),
      cancelledAt: FieldValue.delete(),
      cancellationActor: FieldValue.delete(),
      cancellationReason: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ...appointment, date: schedule.date, time: schedule.time, status: 'pending' };
  });
  return (await safeAppointments([updated]))[0];
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<VercelResponse> {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  const action = requestedAction(req);
  if (!action) return res.status(400).json({ error: 'Unsupported patient action.' });

  try {
    const identity = await authenticate(req);
    await enforceRateLimit(identity, action);
    if (action === 'session') {
      await ensurePatientProfile(identity);
      return res.status(200).json({
        profile: { phoneMasked: maskPhone(identity.phoneE164) },
        appointments: await listAppointments(identity),
      });
    }
    if (action === 'claim') {
      return res.status(200).json({ appointment: await claimAppointment(identity, req.body?.bookingRef) });
    }
    if (action === 'cancel') {
      return res.status(200).json({ appointment: await cancelAppointment(identity, req.body?.appointmentId) });
    }
    if (action === 'availability') {
      return res.status(200).json({
        slots: await appointmentAvailability(identity, req.body?.appointmentId, req.body?.date),
      });
    }
    return res.status(200).json({
      appointment: await rescheduleAppointment(
        identity,
        req.body?.appointmentId,
        req.body?.date,
        req.body?.time,
      ),
    });
  } catch (error) {
    if (error instanceof PatientApiError) return res.status(error.status).json({ error: error.message });
    console.error('[patient-api] Request failed:', error);
    return res.status(500).json({ error: 'Patient appointments are temporarily unavailable.' });
  }
}