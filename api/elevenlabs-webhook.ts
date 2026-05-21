import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac } from 'crypto';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createVoiceBookingRequest } from './_lib/voice-booking-action';

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

function extract(text: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return '';
}

function flattenTranscript(transcript: unknown): string {
  if (typeof transcript === 'string') return transcript;
  if (!Array.isArray(transcript)) return '';
  return (transcript as Array<{ role?: string; message?: string; text?: string }>)
    .map(turn => `${turn.role ?? ''}: ${turn.message ?? turn.text ?? ''}`)
    .join('\n');
}

function getBookingRefPrefix(clinic: Record<string, unknown>): string {
  return typeof clinic['bookingRefPrefix'] === 'string' && clinic['bookingRefPrefix'].trim()
    ? clinic['bookingRefPrefix'].trim()
    : 'VOICE';
}

function verifyWebhookSignature(req: VercelRequest): boolean {
  const secret = process.env['ELEVENLABS_WEBHOOK_SECRET'];
  if (!secret) return true;

  const header = req.headers['elevenlabs-signature'] ?? req.headers['x-elevenlabs-signature'];
  const signature = Array.isArray(header) ? header[0] : header;
  if (!signature) return true;

  const expected = `sha256=${createHmac('sha256', secret).update(JSON.stringify(req.body)).digest('hex')}`;
  return signature === expected;
}

function isConversationEndedEvent(eventType: string): boolean {
  return [
    'post_call_transcription',
    'post_conversation_webhook',
    'conversation_ended',
    'end_of_call_report',
  ].includes(eventType);
}

function extractService(transcript: string): string {
  const service = extract(transcript, [
    /(?:treatment|service|problem|issue|chahiye|need|karwana)[\s:]*([A-Za-z\s]{4,40})/i,
  ]);
  if (service) return service;

  const keywords = [
    'tooth',
    'teeth',
    'root canal',
    'filling',
    'cleaning',
    'extraction',
    'implant',
    'whitening',
    'braces',
    'checkup',
    'scaling',
    'cavity',
  ];
  const lowerTranscript = transcript.toLowerCase();
  const keyword = keywords.find(item => lowerTranscript.includes(item));
  return keyword ? keyword.charAt(0).toUpperCase() + keyword.slice(1) : 'Dental Consultation';
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<VercelResponse> {
  if (req.method !== 'POST') return res.status(405).end();
  if (!verifyWebhookSignature(req)) return res.status(401).json({ error: 'Invalid signature' });

  const body = (req.body ?? {}) as Record<string, unknown>;
  const eventType = String(body['type'] ?? body['event_type'] ?? '');
  if (!isConversationEndedEvent(eventType)) return res.status(200).json({ ok: true });

  const data = (body['data'] ?? body) as Record<string, unknown>;
  const agentId = String(data['agent_id'] ?? body['agent_id'] ?? '');
  const rawTranscript = data['transcript'] ?? data['messages'] ?? body['transcript'] ?? '';
  const transcript = flattenTranscript(rawTranscript);
  if (!agentId || !transcript) return res.status(200).json({ ok: true });

  let clinicId = '';
  let clinic: Record<string, unknown> = {};

  try {
    const snap = await db.collection('clinics')
      .where('elevenLabsAgentId', '==', agentId)
      .limit(1)
      .get();

    if (snap.empty) return res.status(200).json({ ok: true });
    clinicId = snap.docs[0].id;
    clinic = snap.docs[0].data() as Record<string, unknown>;
  } catch (error) {
    console.error('[elevenlabs-webhook] Firestore lookup failed:', error);
    return res.status(200).json({ ok: true });
  }

  const name = extract(transcript, [
    /(?:mera naam|my name is|naam hai|i am|main hoon)\s+([A-Za-z\s]{2,30})/i,
    /(?:patient name|naam)[\s:]+([A-Za-z\s]{3,30})/i,
    /^user:.*?(?:naam|name).*?([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/m,
  ]);
  const phone = extract(transcript, [
    /(?:number|phone|mobile|contact|no)[\s:is]*([6-9]\d{9})/i,
    /([6-9]\d{9})/,
  ]);

  if (!name && !phone) return res.status(200).json({ ok: true });

  const dateMatch = transcript.match(
    /(?:on|date|kal|parso|agle|tomorrow|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*[\s,]*\d{0,2}/i,
  );
  const timeMatch = transcript.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm|baje|bajke|o'clock))/i);

  try {
    await createVoiceBookingRequest(db, {
      clinicId,
      bookingRefPrefix: getBookingRefPrefix(clinic),
      name: name || 'Voice Caller',
      phone,
      service: extractService(transcript),
      preferredDate: dateMatch?.[0]?.trim() ?? '',
      preferredTime: timeMatch?.[1]?.trim() ?? '',
      transcript,
      allowPartial: true,
      source: 'voice_webhook',
    });
  } catch (error) {
    console.error('[elevenlabs-webhook] Firestore write failed:', error);
  }

  return res.status(200).json({ ok: true });
}
