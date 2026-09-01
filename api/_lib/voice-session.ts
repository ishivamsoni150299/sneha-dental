import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash, randomUUID } from 'crypto';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { AggregateField, FieldValue, getFirestore, type DocumentReference } from 'firebase-admin/firestore';
import {
  clinicHasPlatformFeature,
  type PlatformSubscriptionAccess,
} from '../../src/app/core/config/platform-entitlements';
import { buildAgentSystemPrompt, resolveVoiceAgentSettings } from './voice-agent-config';
import { createVoiceSessionToken, verifyVoiceSessionToken } from './voice-session-auth';

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
const MAX_SESSION_SECONDS = 8 * 60;
const CAPABILITY_TTL_MS = 12 * 60 * 1000;
const MAX_SDP_LENGTH = 32_000;
const MIN_SIGNING_SECRET_LENGTH = 32;

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

interface VoiceUsage {
  conversations: number;
  secondsUsed: number;
}

function getSigningSecret(): string {
  const secret = process.env['OPENAI_VOICE_SIGNING_SECRET']?.trim() ?? '';
  return secret.length >= MIN_SIGNING_SECRET_LENGTH ? secret : '';
}

function startOfMonth(): Date {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  return startOfMonth;
}

async function getVoiceUsage(clinicRef: DocumentReference): Promise<VoiceUsage> {
  const snapshot = await clinicRef.collection('voiceSessions')
    .where('startedAt', '>=', startOfMonth())
    .aggregate({
      conversations: AggregateField.count(),
      secondsUsed: AggregateField.sum('durationSeconds'),
    })
    .get();
  const aggregate = snapshot.data();

  return {
    conversations: Number(aggregate.conversations ?? 0),
    secondsUsed: Number(aggregate.secondsUsed ?? 0),
  };
}

function numericSetting(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function openAICallId(location: string | null): string {
  const candidate = location?.split('/').filter(Boolean).pop()?.trim() ?? '';
  return /^rtc_[A-Za-z0-9_-]{4,160}$/.test(candidate) ? candidate : '';
}

async function hangUpOpenAICall(callId: string, apiKey: string): Promise<boolean> {
  try {
    const response = await fetch(`https://api.openai.com/v1/realtime/calls/${callId}/hangup`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (response.ok || response.status === 404 || response.status === 409) return true;
    console.error('[voice-session] OpenAI hangup failed:', response.status, response.headers.get('x-request-id'));
    return false;
  } catch (error) {
    console.error('[voice-session] OpenAI hangup request failed:', error);
    return false;
  }
}

function buildBookingTool(): Record<string, unknown> {
  return {
    type: 'function',
    name: 'submit_voice_booking_request',
    description: 'Submit a dental appointment request only after explaining that the details will be saved and shared with the clinic, reading every detail back, and receiving explicit patient consent.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: { type: 'string', description: 'Patient full name.' },
        phone: { type: 'string', description: 'Patient mobile or WhatsApp number.' },
        email: { type: 'string', description: 'Patient email, when provided.' },
        service: { type: 'string', description: 'Treatment or dental issue.' },
        preferredDate: { type: 'string', description: 'Preferred appointment date in YYYY-MM-DD format.' },
        preferredTime: { type: 'string', description: 'Preferred appointment time in HH:mm 24-hour format.' },
        message: { type: 'string', description: 'Short patient note or relevant context.' },
      },
      required: ['name', 'phone', 'service', 'preferredDate', 'preferredTime'],
    },
  };
}

function safetyIdentifier(req: VercelRequest, clinicId: string): string {
  return createHash('sha256').update(`${clinicId}:${requestIp(req)}`).digest('hex');
}

export async function getOpenAIVoiceUsage(clinicId: string): Promise<VoiceUsage> {
  return getVoiceUsage(db.collection('clinics').doc(clinicId));
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
  // Preserve the trailing CRLF from RTCPeerConnection.createOffer(). OpenAI's
  // SDP parser treats an offer without its terminating line break as EOF.
  const sdp = typeof body['sdp'] === 'string' ? body['sdp'] : '';
  if (!clinicId) return res.status(400).json({ error: 'Clinic is required.' });
  if (!sdp.startsWith('v=0') || sdp.length > MAX_SDP_LENGTH
      || !sdp.includes('m=audio') || !sdp.includes('m=application')) {
    return res.status(400).json({ error: 'A valid WebRTC offer is required.' });
  }

  const clinicDoc = await db.collection('clinics').doc(clinicId).get();
  if (!clinicDoc.exists) return res.status(404).json({ error: 'Clinic not found.' });

  const clinic = clinicDoc.data() as Record<string, unknown>;
  if (!isKnownClinicOrigin(req, clinic)) {
    return res.status(403).json({ error: 'Voice is not available from this domain.' });
  }

  const origin = headerValue(req.headers.origin);
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);

  if (clinic['active'] !== true || !clinicHasPlatformFeature(
    clinic as PlatformSubscriptionAccess,
    'aiVoiceReceptionist',
  )) {
    return res.status(403).json({ error: 'Live voice is not active for this clinic.' });
  }

  const voiceEnabled = clinic['voiceAgentEnabled'] === true && clinic['voiceProvider'] === 'openai';
  const apiKey = process.env['OPENAI_API_KEY']?.trim() ?? '';
  const signingSecret = getSigningSecret();
  if (!voiceEnabled || !apiKey || !signingSecret) {
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
  let usage: VoiceUsage = { conversations: 0, secondsUsed: 0 };
  if (voiceAutoStop) {
    try {
      usage = await getVoiceUsage(clinicDoc.ref);
    } catch (error) {
      console.error('[voice-session] OpenAI usage lookup failed:', error);
      return res.status(503).json({ error: 'Voice usage could not be verified. Please use text chat and try again later.' });
    }
    if (usage.secondsUsed >= hardLimit * 60) {
      return res.status(429).json({ error: 'This clinic has reached its voice-minute limit. Please use text chat, call, or WhatsApp.' });
    }
  }

  const remainingSeconds = voiceAutoStop
    ? Math.max(0, hardLimit * 60 - usage.secondsUsed)
    : MAX_SESSION_SECONDS;
  const maxDurationSeconds = Math.min(MAX_SESSION_SECONDS, remainingSeconds);
  if (maxDurationSeconds < 30) {
    return res.status(429).json({ error: 'This clinic has reached its voice-minute limit. Please use text chat, call, or WhatsApp.' });
  }

  const settings = resolveVoiceAgentSettings(clinic);
  const model = process.env['OPENAI_REALTIME_MODEL']?.trim() || 'gpt-realtime-2.1';
  const transcription: Record<string, unknown> = {
    model: process.env['OPENAI_TRANSCRIPTION_MODEL']?.trim() || 'gpt-4o-mini-transcribe',
    prompt: 'A concise Hindi and English dental clinic conversation with names, phone numbers, dates, and treatment terms.',
  };
  if (settings.language !== 'bilingual') transcription['language'] = settings.languageCode;

  const sessionConfig = {
    type: 'realtime',
    model,
    output_modalities: ['audio'],
    instructions: `${buildAgentSystemPrompt(clinic, { voiceActionEnabled: true })}\n\nOPENING GREETING:\n- Begin the conversation with exactly: "${settings.greeting.replace(/"/g, '\\"')}"`,
    audio: {
      input: {
        noise_reduction: { type: 'near_field' },
        transcription,
        turn_detection: {
          type: 'semantic_vad',
          eagerness: 'medium',
          create_response: true,
          interrupt_response: true,
        },
      },
      output: { voice: settings.voice, speed: 1 },
    },
    tools: [buildBookingTool()],
    tool_choice: 'auto',
    max_output_tokens: 512,
    tracing: null,
    truncation: 'auto',
  };
  const callRequest = new FormData();
  callRequest.set('sdp', sdp);
  callRequest.set('session', JSON.stringify(sessionConfig));

  const callResponse = await fetch('https://api.openai.com/v1/realtime/calls', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'OpenAI-Safety-Identifier': safetyIdentifier(req, clinicId),
    },
    body: callRequest,
  });
  if (!callResponse.ok) {
    const errorBody = (await callResponse.text()).slice(0, 500);
    console.error('[voice-session] OpenAI WebRTC negotiation failed:', callResponse.status, callResponse.headers.get('x-request-id'), errorBody);
    return res.status(502).json({ error: 'Could not start live voice. Please use text chat and try again.' });
  }

  const answerSdp = await callResponse.text();
  const callId = openAICallId(callResponse.headers.get('location'));
  if (!callId) {
    console.error('[voice-session] OpenAI WebRTC response did not include a valid call ID.');
    return res.status(502).json({ error: 'Could not secure live voice controls. Please use text chat and try again.' });
  }
  if (!answerSdp.trim().startsWith('v=0')) {
    await hangUpOpenAICall(callId, apiKey);
    return res.status(502).json({ error: 'Could not start live voice. Please use text chat and try again.' });
  }

  const sessionId = randomUUID();
  const expiresAt = Date.now() + CAPABILITY_TTL_MS;
  const sessionToken = createVoiceSessionToken({ clinicId, sessionId, expiresAt }, signingSecret);

  try {
    await clinicDoc.ref.collection('voiceSessions').doc(sessionId).set({
      provider: 'openai',
      openAiCallId: callId,
      model,
      status: 'reserved',
      durationSeconds: maxDurationSeconds,
      maxDurationSeconds,
      bookingAttempts: 0,
      startedAt: new Date(),
      expiresAt: new Date(expiresAt),
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error('[voice-session] Failed to reserve OpenAI voice usage:', error);
    await hangUpOpenAICall(callId, apiKey);
    return res.status(503).json({ error: 'Could not reserve live voice usage. Please use text chat and try again.' });
  }

  return res.status(200).json({
    sdp: answerSdp,
    sessionId,
    sessionToken,
    maxDurationSeconds,
    model,
  });
}

export async function handleVoiceSessionEnd(
  req: VercelRequest,
  res: VercelResponse,
): Promise<VercelResponse> {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  const body = (req.body ?? {}) as Record<string, unknown>;
  const clinicId = typeof body['clinicId'] === 'string' ? body['clinicId'].trim().slice(0, 100) : '';
  const sessionId = typeof body['sessionId'] === 'string' ? body['sessionId'].trim() : '';
  const sessionToken = typeof body['sessionToken'] === 'string' ? body['sessionToken'].trim() : '';
  const capability = verifyVoiceSessionToken(sessionToken, getSigningSecret());
  if (!capability || capability.clinicId !== clinicId || capability.sessionId !== sessionId) {
    return res.status(401).json({ error: 'Invalid voice session.' });
  }

  const clinicRef = db.collection('clinics').doc(clinicId);
  const clinicDoc = await clinicRef.get();
  if (!clinicDoc.exists || !isKnownClinicOrigin(req, clinicDoc.data() as Record<string, unknown>)) {
    return res.status(403).json({ error: 'Voice is not available from this domain.' });
  }

  const sessionRef = clinicRef.collection('voiceSessions').doc(sessionId);
  const sessionData = await db.runTransaction(async transaction => {
    const session = await transaction.get(sessionRef);
    if (!session.exists) return { state: 'missing' as const };
    const status = session.data()?.['status'];
    if (status === 'ended') return { state: 'ended' as const };
    if (status === 'ending') return { state: 'ending' as const };
    if (status !== 'reserved' && status !== 'end_failed') return { state: 'invalid' as const };
    transaction.set(sessionRef, {
      status: 'ending',
      endingAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { state: 'claimed' as const, data: session.data() ?? {} };
  });
  if (sessionData.state === 'missing') return res.status(404).json({ error: 'Voice session not found.' });
  if (sessionData.state === 'ended') return res.status(200).json({ ok: true, duplicate: true });
  if (sessionData.state === 'ending') return res.status(202).json({ ok: true, ending: true });
  if (sessionData.state !== 'claimed') return res.status(409).json({ error: 'Voice session cannot be ended.' });

  const callId = typeof sessionData.data['openAiCallId'] === 'string'
    ? openAICallId(sessionData.data['openAiCallId'])
    : '';
  const apiKey = process.env['OPENAI_API_KEY']?.trim() ?? '';
  if (!callId || !apiKey) {
    await sessionRef.set({ status: 'end_failed' }, { merge: true });
    return res.status(503).json({ error: 'Voice session could not be closed securely.' });
  }

  if (!await hangUpOpenAICall(callId, apiKey)) {
    await sessionRef.set({ status: 'end_failed' }, { merge: true });
    return res.status(502).json({ error: 'Voice session could not be closed securely.' });
  }

  const maxDurationSeconds = numericSetting(sessionData.data['maxDurationSeconds'], MAX_SESSION_SECONDS);
  const startedAt = sessionData.data['startedAt'];
  const startedAtMs = typeof startedAt?.toDate === 'function' ? startedAt.toDate().getTime() : 0;
  const durationSeconds = startedAtMs > 0
    ? Math.min(maxDurationSeconds, Math.max(0, Math.ceil((Date.now() - startedAtMs) / 1_000)))
    : maxDurationSeconds;
  await sessionRef.set({
    status: 'ended',
    durationSeconds,
    endedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return res.status(200).json({ ok: true });
}
