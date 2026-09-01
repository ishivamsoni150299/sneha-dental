import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import {
  clinicHasPlatformFeature,
  type PlatformSubscriptionAccess,
} from '../src/app/core/config/platform-entitlements';
import { normalizeOpenAIVoice, normalizeVoiceLanguage } from './_lib/voice-agent-config';
import {
  getOpenAIVoiceUsage,
  handleVoiceSession,
  handleVoiceSessionEnd,
} from './_lib/voice-session';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env['FIREBASE_PROJECT_ID'],
      clientEmail: process.env['FIREBASE_CLIENT_EMAIL'],
      privateKey: process.env['FIREBASE_PRIVATE_KEY']?.replace(/\\n/g, '\n'),
    }),
  });
}

const auth = getAuth();
const db = getFirestore();
const INCLUDED_MINUTES = 30;
const OVERAGE_RATE_INR = 20;

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function getAction(req: VercelRequest): string {
  const queryAction = typeof req.query['action'] === 'string' ? req.query['action'] : '';
  const body = (req.body ?? {}) as Record<string, unknown>;
  return cleanText(queryAction || body['action'], 40);
}

function getClinicId(req: VercelRequest): string {
  const queryClinicId = typeof req.query['clinicId'] === 'string' ? req.query['clinicId'] : '';
  const body = (req.body ?? {}) as Record<string, unknown>;
  return cleanText(queryClinicId || body['clinicId'], 100);
}

function bearerToken(req: VercelRequest): string {
  const header = req.headers.authorization;
  const value = Array.isArray(header) ? (header[0] ?? '') : (header ?? '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

async function canManageClinic(req: VercelRequest, clinicId: string): Promise<boolean> {
  const token = bearerToken(req);
  if (!token) return false;

  const decoded = await auth.verifyIdToken(token);
  if (decoded.email_verified !== true) return false;
  if (decoded['clinicId'] === clinicId && decoded['role'] === 'admin') return true;

  const [clinic, superAdmin] = await Promise.all([
    db.collection('clinics').doc(clinicId).get(),
    db.collection('superAdmins').doc(decoded.uid).get(),
  ]);
  return superAdmin.exists || clinic.data()?.['adminUid'] === decoded.uid;
}

async function clinicHasVoiceAccess(clinicId: string): Promise<boolean> {
  const clinic = await db.collection('clinics').doc(clinicId).get();
  if (!clinic.exists || clinic.data()?.['active'] !== true) return false;
  return clinicHasPlatformFeature(
    clinic.data() as PlatformSubscriptionAccess,
    'aiVoiceReceptionist',
  );
}

function assertOpenAIConfigured(res: VercelResponse): boolean {
  const signingSecret = process.env['OPENAI_VOICE_SIGNING_SECRET']?.trim() ?? '';
  if (process.env['OPENAI_API_KEY']?.trim() && signingSecret.length >= 32) return true;
  res.status(503).json({ error: 'OpenAI voice is not configured.' });
  return false;
}

async function enableVoice(req: VercelRequest, res: VercelResponse, clinicId: string): Promise<VercelResponse> {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  if (!assertOpenAIConfigured(res)) return res;

  await db.collection('clinics').doc(clinicId).set({
    voiceAgentEnabled: true,
    voiceProvider: 'openai',
    voiceAgentVoiceId: 'marin',
    elevenLabsAgentId: FieldValue.delete(),
    elevenLabsBookingToolId: FieldValue.delete(),
    voiceAgentWhatsapp: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return res.status(200).json({ ok: true, provider: 'openai', voice: 'marin' });
}

async function updateVoice(req: VercelRequest, res: VercelResponse, clinicId: string): Promise<VercelResponse> {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  if (!assertOpenAIConfigured(res)) return res;

  const body = (req.body ?? {}) as Record<string, unknown>;
  const voiceId = normalizeOpenAIVoice(cleanText(body['voiceId'], 30));
  const greeting = cleanText(body['greeting'], 500);
  const persona = cleanText(body['persona'], 2_000);

  await db.collection('clinics').doc(clinicId).set({
    voiceAgentEnabled: true,
    voiceProvider: 'openai',
    voiceAgentGreeting: greeting || FieldValue.delete(),
    voiceAgentLanguage: normalizeVoiceLanguage(body['language']),
    voiceAgentPersona: persona || FieldValue.delete(),
    voiceAgentVoiceId: voiceId,
    elevenLabsAgentId: FieldValue.delete(),
    elevenLabsBookingToolId: FieldValue.delete(),
    voiceAgentWhatsapp: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return res.status(200).json({ ok: true, provider: 'openai', voice: voiceId });
}

async function usage(res: VercelResponse, clinicId: string): Promise<VercelResponse> {
  const [voiceUsage, account] = await Promise.all([
    getOpenAIVoiceUsage(clinicId),
    db.collection('clinics').doc(clinicId).collection('private').doc('account').get(),
  ]);
  const budgetValue = Number(account.data()?.['voiceBudgetCap'] ?? 1_000);
  const budgetCap = Number.isFinite(budgetValue) && budgetValue >= 0 ? budgetValue : 1_000;
  const minutesLimit = INCLUDED_MINUTES + Math.floor(budgetCap / OVERAGE_RATE_INR);

  return res.status(200).json({
    conversations: voiceUsage.conversations,
    minutesUsed: Math.ceil(voiceUsage.secondsUsed / 60),
    minutesLimit,
    provider: 'openai',
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<VercelResponse> {
  const action = getAction(req);
  try {
    if (action === 'voice-session') return await handleVoiceSession(req, res);
    if (action === 'end-session') return await handleVoiceSessionEnd(req, res);

    const clinicId = getClinicId(req);
    if (!clinicId) return res.status(400).json({ error: 'Clinic is required.' });
    if (!await canManageClinic(req, clinicId)) {
      return res.status(403).json({ error: 'You do not have access to this clinic.' });
    }
    if (!await clinicHasVoiceAccess(clinicId)) {
      return res.status(403).json({ error: 'An active Pro plan is required for the AI Voice Receptionist.' });
    }

    if (action === 'enable') return enableVoice(req, res, clinicId);
    if (action === 'update') return updateVoice(req, res, clinicId);
    if (action === 'usage') return usage(res, clinicId);
    return res.status(400).json({ error: 'Unknown OpenAI voice action.' });
  } catch (error) {
    console.error('[openai-voice] request failed:', error);
    return res.status(500).json({ error: 'OpenAI voice request failed.' });
  }
}