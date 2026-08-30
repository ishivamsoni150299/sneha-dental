import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'crypto';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

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
const RATE_LIMIT_MAX = 4;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const INCLUDED_MINUTES = 30;
const OVERAGE_RATE_INR = 20;

function headerValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/:\d+$/, '').replace(/\/.*$/, '');
}

function requestIp(req: VercelRequest): string {
  return headerValue(req.headers['x-forwarded-for']).split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || 'unknown';
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

async function isRateLimited(req: VercelRequest, clinicId: string): Promise<boolean> {
  const bucket = Math.floor(Date.now() / RATE_LIMIT_WINDOW_MS);
  const fingerprint = createHash('sha256')
    .update(`${requestIp(req)}:${clinicId}:${bucket}`)
    .digest('hex');
  const ref = db.collection('rateLimits').doc(`voice_session_${fingerprint}`);

  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const count = Number(snapshot.data()?.['count'] ?? 0);
    if (count >= RATE_LIMIT_MAX) return true;

    transaction.set(ref, {
      type: 'voice_session',
      clinicId,
      count: count + 1,
      expiresAt: new Date((bucket + 2) * RATE_LIMIT_WINDOW_MS),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return false;
  });
}

async function getMinutesUsed(apiKey: string, agentId: string, stopAtMinutes: number): Promise<number | null> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  let cursor = '';
  let totalSeconds = 0;

  for (let page = 0; page < 12; page += 1) {
    const query = new URLSearchParams({
      agent_id: agentId,
      page_size: '100',
      call_start_after_unix: String(Math.floor(startOfMonth.getTime() / 1000)),
    });
    if (cursor) query.set('cursor', cursor);

    const response = await fetch(`https://api.elevenlabs.io/v1/convai/conversations?${query}`, {
      headers: { 'xi-api-key': apiKey },
    });
    if (!response.ok) return null;

    const data = await response.json() as {
      conversations?: Array<{ call_duration_secs?: number }>;
      has_more?: boolean;
      next_cursor?: string | null;
    };
    totalSeconds += (data.conversations ?? [])
      .reduce((sum, conversation) => sum + (conversation.call_duration_secs ?? 0), 0);

    if (Math.ceil(totalSeconds / 60) >= stopAtMinutes) break;
    if (!data.has_more) break;
    if (!data.next_cursor) return null;
    cursor = data.next_cursor;
    if (page === 11) return null;
  }

  return Math.ceil(totalSeconds / 60);
}

function numericSetting(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

export async function handleVoiceSession(
  req: VercelRequest,
  res: VercelResponse,
): Promise<VercelResponse> {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  const body = (req.body ?? {}) as Record<string, unknown>;
  const clinicId = typeof body['clinicId'] === 'string' ? body['clinicId'].trim().slice(0, 100) : '';
  if (!clinicId) return res.status(400).json({ error: 'Clinic is required.' });

  const clinicDoc = await db.collection('clinics').doc(clinicId).get();
  if (!clinicDoc.exists) return res.status(404).json({ error: 'Clinic not found.' });

  const clinic = clinicDoc.data() as Record<string, unknown>;
  if (!isKnownClinicOrigin(req, clinic)) {
    return res.status(403).json({ error: 'Voice is not available from this domain.' });
  }

  const origin = headerValue(req.headers.origin);
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);

  if (clinic['active'] !== true
      || clinic['subscriptionPlan'] !== 'pro'
      || clinic['subscriptionStatus'] !== 'active') {
    return res.status(403).json({ error: 'Live voice is not active for this clinic.' });
  }

  const agentId = typeof clinic['elevenLabsAgentId'] === 'string' ? clinic['elevenLabsAgentId'].trim() : '';
  const apiKey = process.env['ELEVENLABS_API_KEY']?.trim() ?? '';
  if (!agentId || !apiKey) {
    return res.status(503).json({ error: 'Live voice is temporarily unavailable.' });
  }

  if (await isRateLimited(req, clinicId)) {
    res.setHeader('Retry-After', '600');
    return res.status(429).json({ error: 'Too many voice sessions. Please wait a few minutes or use text chat.' });
  }

  const privateDoc = await clinicDoc.ref.collection('private').doc('account').get();
  const account = privateDoc.data() ?? {};
  const voiceAutoStop = typeof account['voiceAutoStop'] === 'boolean'
    ? account['voiceAutoStop']
    : clinic['voiceAutoStop'] !== false;
  const budgetCap = numericSetting(account['voiceBudgetCap'] ?? clinic['voiceBudgetCap'], 1_000);
  const hardLimit = INCLUDED_MINUTES + Math.floor(budgetCap / OVERAGE_RATE_INR);
  if (voiceAutoStop) {
    const minutesUsed = await getMinutesUsed(apiKey, agentId, hardLimit);
    if (minutesUsed === null) {
      return res.status(503).json({ error: 'Voice usage could not be verified. Please use text chat and try again later.' });
    }
    if (minutesUsed >= hardLimit) {
      return res.status(429).json({ error: 'This clinic has reached its voice-minute limit. Please use text chat, call, or WhatsApp.' });
    }
  }

  const tokenResponse = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`,
    { headers: { 'xi-api-key': apiKey } },
  );
  if (!tokenResponse.ok) {
    console.error('[voice-session] ElevenLabs token request failed:', tokenResponse.status);
    return res.status(502).json({ error: 'Could not start live voice. Please use text chat and try again.' });
  }

  const tokenData = await tokenResponse.json() as { token?: string };
  if (!tokenData.token) {
    return res.status(502).json({ error: 'Could not start live voice. Please use text chat and try again.' });
  }

  return res.status(200).json({ token: tokenData.token });
}