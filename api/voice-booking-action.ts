import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createVoiceBookingRequest, type VoiceBookingInput } from './_lib/voice-booking-action';
import { sendAppointmentNotification } from './_lib/appointment-notification';
import { verifyVoiceSessionToken, type VoiceSessionCapability } from './_lib/voice-session-auth';

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

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function bodyValue(body: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = asText(body[key]);
    if (value) return value;
  }
  return '';
}

function queryValue(req: VercelRequest, key: string): string {
  const value = req.query[key];
  return typeof value === 'string' ? value.trim() : '';
}

function headerValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/:\d+$/, '').replace(/\/.*$/, '');
}

function isKnownClinicOrigin(req: VercelRequest, clinic: Record<string, unknown>): boolean {
  const requestHost = normalizeHost(headerValue(req.headers['x-forwarded-host']) || headerValue(req.headers.host));
  const origin = headerValue(req.headers.origin);
  let originHost = '';

  try {
    originHost = origin ? normalizeHost(new URL(origin).hostname) : '';
  } catch {
    return false;
  }

  if (['localhost', '127.0.0.1'].includes(requestHost)) {
    return !originHost || ['localhost', '127.0.0.1'].includes(originHost);
  }

  const knownHosts = [clinic['domain'], clinic['vercelDomain']]
    .filter((value): value is string => typeof value === 'string')
    .map(normalizeHost)
    .filter(Boolean);

  return !!originHost && originHost === requestHost && knownHosts.includes(requestHost);
}

function getSigningSecret(): string {
  const secret = process.env['OPENAI_VOICE_SIGNING_SECRET']?.trim() ?? '';
  return secret.length >= 32 ? secret : '';
}

function getCapability(req: VercelRequest): VoiceSessionCapability | null {
  const token = headerValue(req.headers['x-voice-session-token']).trim();
  return verifyVoiceSessionToken(token, getSigningSecret());
}

async function authorizeVoiceBooking(
  req: VercelRequest,
  capability: VoiceSessionCapability,
): Promise<{ ok: true; bookingRefPrefix: string } | { ok: false; status: number; message: string }> {
  const clinicRef = db.collection('clinics').doc(capability.clinicId);
  const clinicDoc = await clinicRef.get();
  if (!clinicDoc.exists || !isKnownClinicOrigin(req, clinicDoc.data() as Record<string, unknown>)) {
    return { ok: false, status: 403, message: 'Voice booking is not available from this domain.' };
  }

  const sessionRef = clinicRef.collection('voiceSessions').doc(capability.sessionId);
  const allowed = await db.runTransaction(async transaction => {
    const session = await transaction.get(sessionRef);
    if (!session.exists || session.data()?.['status'] !== 'reserved') return false;

    const attempts = Number(session.data()?.['bookingAttempts'] ?? 0);
    if (!Number.isFinite(attempts) || attempts >= 5) return false;
    transaction.update(sessionRef, {
      bookingAttempts: attempts + 1,
      lastBookingAttemptAt: new Date(),
    });
    return true;
  });

  if (!allowed) {
    return { ok: false, status: 429, message: 'This voice session cannot submit more booking requests.' };
  }

  return {
    ok: true,
    bookingRefPrefix: asText(clinicDoc.data()?.['bookingRefPrefix']).slice(0, 16),
  };
}

function toBookingInput(
  req: VercelRequest,
  clinicId: string,
  bookingRefPrefix: string,
): VoiceBookingInput {
  const body = (req.body ?? {}) as Record<string, unknown>;
  return {
    clinicId,
    bookingRefPrefix,
    name: bodyValue(body, ['name', 'patientName', 'patient_name']),
    phone: bodyValue(body, ['phone', 'phoneNumber', 'phone_number', 'mobile']),
    email: bodyValue(body, ['email', 'patientEmail', 'patient_email']),
    service: bodyValue(body, ['service', 'treatment', 'dentalIssue', 'dental_issue', 'issue']),
    preferredDate: bodyValue(body, ['preferredDate', 'preferred_date', 'date']),
    preferredTime: bodyValue(body, ['preferredTime', 'preferred_time', 'time']),
    message: bodyValue(body, ['message', 'notes', 'note']),
    transcript: bodyValue(body, ['transcript', 'conversationSummary', 'conversation_summary']),
    source: 'voice',
  };
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<VercelResponse> {
  if (queryValue(req, 'action') === 'notify-web-booking') {
    return sendAppointmentNotification(req, res);
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed.' });
  }

  const capability = getCapability(req);
  if (!capability) {
    return res.status(401).json({ success: false, message: 'Invalid or expired voice session.' });
  }

  const requestedClinicId = bodyValue((req.body ?? {}) as Record<string, unknown>, ['clinicId', 'clinic_id']);
  if (requestedClinicId && requestedClinicId !== capability.clinicId) {
    return res.status(403).json({ success: false, message: 'Voice session does not match this clinic.' });
  }

  const authorization = await authorizeVoiceBooking(req, capability);
  if (!authorization.ok) {
    return res.status(authorization.status).json({ success: false, message: authorization.message });
  }

  const result = await createVoiceBookingRequest(
    db,
    toBookingInput(req, capability.clinicId, authorization.bookingRefPrefix),
  );

  return res.status(200).json({
    success: result.ok,
    booking_created: result.bookingCreated,
    booking_ref: result.bookingRef ?? null,
    code: result.code ?? null,
    missing_fields: result.missingFields ?? [],
    message: result.message,
  });
}
