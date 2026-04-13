import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac } from 'crypto';
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

// ── Simple regex transcript parser ───────────────────────────────────────────
function extract(text: string, patterns: RegExp[]): string {
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) return m[1].trim();
  }
  return '';
}

function flattenTranscript(
  transcript: unknown,  // can be string OR array of {role, message}
): string {
  if (typeof transcript === 'string') return transcript;
  if (!Array.isArray(transcript)) return '';
  return (transcript as Array<{ role?: string; message?: string; text?: string }>)
    .map(t => `${t.role ?? ''}: ${t.message ?? t.text ?? ''}`)
    .join('\n');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  // ── Verify signature (ElevenLabs HMAC-SHA256) ─────────────────────────────
  const secret = process.env['ELEVENLABS_WEBHOOK_SECRET'];
  if (secret) {
    const sig = req.headers['elevenlabs-signature'] as string | undefined
             ?? req.headers['x-elevenlabs-signature'] as string | undefined;
    if (sig) {
      const rawBody = JSON.stringify(req.body);  // body is pre-parsed by Vercel
      const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
      if (sig !== expected) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }
  }

  const body = req.body ?? {};

  // ElevenLabs sends various event types — only process end-of-conversation
  const eventType = (body.type ?? body.event_type ?? '') as string;
  if (
    eventType !== 'post_conversation_webhook' &&
    eventType !== 'conversation_ended'        &&
    eventType !== 'end_of_call_report'
  ) {
    return res.status(200).json({ ok: true });
  }

  // Extract fields — ElevenLabs wraps data in `data` or at root level
  const data       = body.data ?? body;
  const agentId    = (data.agent_id ?? body.agent_id ?? '') as string;
  const rawTranscript = data.transcript ?? data.messages ?? body.transcript ?? '';
  const transcript = flattenTranscript(rawTranscript);

  if (!agentId || !transcript) return res.status(200).json({ ok: true });

  // Look up which clinic owns this agent
  let clinicId = '';
  try {
    const snap = await db.collection('clinics')
      .where('elevenLabsAgentId', '==', agentId)
      .limit(1)
      .get();
    if (snap.empty) return res.status(200).json({ ok: true });
    clinicId = snap.docs[0].id;
  } catch (err) {
    console.error('[elevenlabs-webhook] Firestore lookup failed:', err);
    return res.status(200).json({ ok: true });
  }

  // Extract booking details from transcript
  const name = extract(transcript, [
    /(?:mera naam|my name is|naam hai|i am|main hoon)\s+([A-Za-z\s]{2,30})/i,
    /(?:patient name|naam)[\s:]+([A-Za-z\s]{3,30})/i,
    /^user:.*?(?:naam|name).*?([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/m,
  ]);

  const phone = extract(transcript, [
    /(?:number|phone|mobile|contact|no)[\s:is]*([6-9]\d{9})/i,
    /([6-9]\d{9})/,
  ]);

  const service = extract(transcript, [
    /(?:treatment|service|problem|issue|chahiye|need|karwana)[\s:]*([A-Za-z\s]{4,40})/i,
  ]) || (() => {
    const keywords = ['tooth', 'teeth', 'root canal', 'filling', 'cleaning', 'extraction',
                      'implant', 'whitening', 'braces', 'checkup', 'scaling', 'cavity'];
    for (const k of keywords) {
      if (transcript.toLowerCase().includes(k)) {
        return k.charAt(0).toUpperCase() + k.slice(1);
      }
    }
    return 'Dental Consultation';
  })();

  const dateMatch = transcript.match(
    /(?:on|date|kal|parso|agle|tomorrow|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*[\s,]*\d{0,2}/i,
  );
  const timeMatch = transcript.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm|baje|bajke|o'clock))/i);

  // Only save if we extracted at least name or phone (otherwise it was a non-booking call)
  if (!name && !phone) return res.status(200).json({ ok: true });

  try {
    await db.collection('appointments').add({
      clinicId,
      bookingRef: `VOICE-${Date.now().toString(36).toUpperCase()}`,
      name:    name    || 'Voice Caller',
      phone:   phone   || '',
      service: service || 'Dental Consultation',
      date:    dateMatch?.[0]?.trim() ?? '',
      time:    timeMatch?.[1]?.trim() ?? '',
      status:  'pending',
      source:  'voice',
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error('[elevenlabs-webhook] Firestore write failed:', err);
  }

  return res.status(200).json({ ok: true });
}
