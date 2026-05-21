import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createVoiceBookingRequest, type VoiceBookingInput } from './_lib/voice-booking-action';

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

function getActionSecret(): string {
  return (process.env['VOICE_ACTION_SECRET'] || process.env['ELEVENLABS_WEBHOOK_SECRET'] || '').trim();
}

function isAuthorized(req: VercelRequest): boolean {
  const expected = getActionSecret();
  if (!expected) return true;

  const header = req.headers['x-voice-action-secret'] ?? req.headers['x-elevenlabs-action-secret'];
  const actual = Array.isArray(header) ? header[0] : header;
  return actual === expected;
}

function toBookingInput(req: VercelRequest): VoiceBookingInput {
  const body = (req.body ?? {}) as Record<string, unknown>;
  return {
    clinicId: bodyValue(body, ['clinicId', 'clinic_id']) || queryValue(req, 'clinicId'),
    bookingRefPrefix: bodyValue(body, ['bookingRefPrefix', 'booking_ref_prefix']),
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
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed.' });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ success: false, message: 'Unauthorized voice action request.' });
  }

  const result = await createVoiceBookingRequest(db, toBookingInput(req));

  return res.status(200).json({
    success: result.ok,
    booking_created: result.bookingCreated,
    booking_ref: result.bookingRef ?? null,
    code: result.code ?? null,
    missing_fields: result.missingFields ?? [],
    message: result.message,
  });
}
