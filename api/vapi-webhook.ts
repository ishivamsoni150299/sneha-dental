import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId:   process.env['FIREBASE_PROJECT_ID'],
      clientEmail: process.env['FIREBASE_CLIENT_EMAIL'],
      privateKey:  process.env['FIREBASE_PRIVATE_KEY']?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();

function extractField(transcript: string, patterns: RegExp[]): string {
  for (const pat of patterns) {
    const m = transcript.match(pat);
    if (m?.[1]) return m[1].trim();
  }
  return '';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  // Verify webhook secret
  const secret = process.env['VAPI_WEBHOOK_SECRET'];
  if (secret && req.headers['x-vapi-secret'] !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const body      = req.body ?? {};
  const eventType = body.message?.type as string ?? body.type as string ?? '';

  // Only process end-of-call summary
  if (eventType !== 'end-of-call-report' && eventType !== 'call-end') {
    return res.status(200).json({ ok: true });
  }

  const call      = body.message?.call ?? body.call ?? {};
  const clinicId  = call.metadata?.clinicId as string | undefined;
  const transcript = (body.message?.transcript ?? body.transcript ?? '') as string;

  if (!clinicId || !transcript) {
    return res.status(200).json({ ok: true });
  }

  // Extract booking details from transcript using simple pattern matching
  const name    = extractField(transcript, [
    /(?:mera naam|my name is|naam hai)\s+([A-Za-z\s]+)/i,
    /(?:patient name|naam)[\s:]+([A-Za-z\s]{3,30})/i,
  ]);

  const phone   = extractField(transcript, [
    /(?:number|phone|mobile|contact)[\s:is]*([6-9]\d{9})/i,
    /([6-9]\d{9})/,
  ]);

  const service = extractField(transcript, [
    /(?:treatment|service|problem|issue|need)\s+(?:for|is|:)?\s*([A-Za-z\s]{4,40})/i,
    /(?:tooth|teeth|root|filling|cleaning|extraction|implant|whitening|braces|checkup)[A-Za-z\s]*/i,
  ]) || 'Dental Consultation';

  const dateMatch = transcript.match(
    /(?:on|date|kal|parso|tomorrow|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{0,2}/i
  );
  const timeMatch = transcript.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm|baje|bajke))/i);

  const preferredDate = dateMatch?.[0]?.trim() ?? '';
  const preferredTime = timeMatch?.[1]?.trim()  ?? '';

  // Only save if we got at least a name or phone (otherwise it was a non-booking call)
  if (!name && !phone) {
    return res.status(200).json({ ok: true });
  }

  try {
    await db.collection('appointments').add({
      clinicId,
      bookingRef: `VOICE-${Date.now().toString(36).toUpperCase()}`,
      name:       name     || 'Voice Caller',
      phone:      phone    || '',
      service:    service  || 'Dental Consultation',
      date:       preferredDate || '',
      time:       preferredTime || '',
      status:     'pending',
      source:     'voice',
      createdAt:  FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error('[vapi-webhook] Firestore write failed:', err);
    // Still return 200 so Vapi does not retry the webhook endlessly
    return res.status(200).json({ ok: true });
  }

  return res.status(200).json({ ok: true });
}
