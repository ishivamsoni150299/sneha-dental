import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type DocumentReference } from 'firebase-admin/firestore';
import {
  advanceCallStatus,
  deriveCallOutcome,
  mapProviderCallStatus,
  normalizeIndianPhone,
  providerEventMatchesCall,
  providerSchedulePlan,
  queuePolicyBlockReason,
  validateCallSchedule,
  validateImmediateCall,
  type LeadCallOutcome,
  type LeadCallStatus,
} from './_lib/lead-ai-call-policy';

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
const VAPI_CALL_URL = 'https://api.vapi.ai/call';
const PLATFORM_URL = 'https://mydentalplatform.com';
const ACTIVE_CALL_STATUSES = new Set(['preparing', 'scheduled', 'queued', 'ringing', 'in_progress']);

class RequestError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
  }
}

interface VapiConfig {
  apiKey: string;
  assistantId: string;
  assistantVersion: string;
  phoneNumberId: string;
  webhookSecret: string;
}

interface ReservedLead {
  clinicName: string;
  doctorName: string;
  city: string;
  phone: string;
  attempts: number;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function safeVoiceText(value: unknown, maxLength = 120): string {
  return cleanText(value, maxLength).replace(/[\r\n{}]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function headerValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function requestAction(req: VercelRequest): string {
  const queryAction = typeof req.query['action'] === 'string' ? req.query['action'] : '';
  return cleanText(queryAction || asRecord(req.body)['action'], 30);
}

function bearerToken(req: VercelRequest): string {
  const header = headerValue(req.headers.authorization);
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function secureEqual(left: string, right: string): boolean {
  const leftHash = createHash('sha256').update(left).digest();
  const rightHash = createHash('sha256').update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function vapiQueueConfig(): VapiConfig {
  if (process.env['LEAD_AI_CALLING_ENABLED']?.trim().toLowerCase() !== 'true') {
    throw new RequestError(503, 'Outbound AI calling is disabled.');
  }
  const config = {
    apiKey: process.env['VAPI_API_KEY']?.trim() ?? '',
    assistantId: process.env['VAPI_LEAD_ASSISTANT_ID']?.trim() ?? '',
    assistantVersion: process.env['VAPI_LEAD_ASSISTANT_VERSION']?.trim() ?? '',
    phoneNumberId: process.env['VAPI_PHONE_NUMBER_ID']?.trim() ?? '',
    webhookSecret: process.env['VAPI_WEBHOOK_SECRET']?.trim() ?? '',
  };
  if (
    !config.apiKey
    || !config.assistantId
    || !config.assistantVersion
    || !config.phoneNumberId
    || config.webhookSecret.length < 32
  ) {
    throw new RequestError(503, 'Outbound AI calling is not configured.');
  }
  return config;
}

function vapiWebhookSecret(): string {
  const secret = process.env['VAPI_WEBHOOK_SECRET']?.trim() ?? '';
  if (secret.length < 32) throw new RequestError(503, 'Voice provider webhooks are not configured.');
  return secret;
}

function vapiApiKey(): string {
  const apiKey = process.env['VAPI_API_KEY']?.trim() ?? '';
  if (!apiKey) throw new RequestError(503, 'Outbound AI calling is not configured.');
  return apiKey;
}

async function cancelProviderCall(callId: string, apiKey = vapiApiKey()): Promise<void> {
  let response: Response;
  let responseText = '';
  try {
    response = await fetch(`${VAPI_CALL_URL}/${encodeURIComponent(callId)}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    responseText = await response.text();
  } catch {
    throw new RequestError(502, 'The voice provider could not be reached to cancel the call.');
  }
  if (!response.ok) {
    console.error('[lead-ai-call] Vapi rejected cancellation:', response.status, responseText.slice(0, 500));
    throw new RequestError(502, 'The voice provider did not accept the call cancellation.');
  }
}

async function assertSuperAdmin(req: VercelRequest): Promise<DecodedIdToken> {
  const token = bearerToken(req);
  if (!token) throw new RequestError(401, 'Authentication required.');

  const decoded = await auth.verifyIdToken(token);
  if (decoded.email_verified !== true) {
    throw new RequestError(403, 'Verify your email before scheduling calls.');
  }
  const admin = await db.collection('superAdmins').doc(decoded.uid).get();
  if (!admin.exists) throw new RequestError(403, 'Super admin access required.');
  return decoded;
}

function openingScript(lead: ReservedLead): string {
  const contact = lead.doctorName ? `Dr. ${lead.doctorName}` : 'the clinic owner';
  return `Hello, may I speak with ${contact}? This is an automated AI assistant calling from My Dental Platform. You previously agreed to receive this call. Is now a good time for a brief conversation about your clinic website and appointment workflow? You can ask me to stop at any time.`;
}

async function markReservationFailed(
  leadRef: DocumentReference,
  requestId: string,
  message: string,
): Promise<void> {
  try {
    await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(leadRef);
      if (!snapshot.exists || snapshot.data()?.['aiCallRequestId'] !== requestId) return;
      transaction.update(leadRef, {
        aiCallStatus: 'failed',
        aiCallError: message,
        aiCallRequestId: FieldValue.delete(),
        aiCallPreparedAt: FieldValue.delete(),
      });
      transaction.set(leadRef.collection('activities').doc(`ai_call_${requestId}_failed`), {
        type: 'ai_call',
        note: `AI call could not be queued: ${message}`,
        createdAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
  } catch (error) {
    console.error('[lead-ai-call] Could not release failed reservation:', error);
  }
}

async function queueCall(req: VercelRequest, res: VercelResponse): Promise<VercelResponse> {
  const actor = await assertSuperAdmin(req);
  const config = vapiQueueConfig();
  const body = asRecord(req.body);
  const leadId = cleanText(body['leadId'], 128);
  const consentSource = cleanText(body['consentSource'], 160);
  const timing = cleanText(body['timing'], 16);

  if (!/^[A-Za-z0-9_-]+$/.test(leadId)) throw new RequestError(400, 'Choose a valid lead.');
  if (body['consentConfirmed'] !== true) {
    throw new RequestError(400, 'Explicit call consent must be verified.');
  }
  if (consentSource.length < 3) {
    throw new RequestError(400, 'Describe where and when call consent was received.');
  }
  if (timing !== 'now' && timing !== 'scheduled') {
    throw new RequestError(400, 'Choose whether to start the call now or schedule it for later.');
  }

  const schedule = timing === 'now'
    ? validateImmediateCall()
    : validateCallSchedule(body['scheduledFor']);
  if (!schedule.ok || !schedule.scheduledAt) {
    throw new RequestError(400, schedule.error ?? 'Choose a valid call timing.');
  }

  const leadRef = db.collection('leads').doc(leadId);
  const requestId = randomUUID();
  const preparedAt = new Date().toISOString();
  const consentAt = preparedAt;
  const callAt = schedule.scheduledAt.toISOString();
  let reservedLead: ReservedLead | null = null;

  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(leadRef);
    if (!snapshot.exists) throw new RequestError(404, 'Lead not found.');
    const lead = snapshot.data() ?? {};
    const blockReason = queuePolicyBlockReason(lead, schedule.scheduledAt!.getTime());
    if (blockReason) throw new RequestError(409, blockReason);

    const phone = normalizeIndianPhone(lead['phone']);
    if (!phone) throw new RequestError(400, 'Add a valid Indian phone number before starting a call.');
    const attempts = typeof lead['aiCallAttempts'] === 'number' && Number.isFinite(lead['aiCallAttempts'])
      ? lead['aiCallAttempts']
      : 0;
    reservedLead = {
      clinicName: safeVoiceText(lead['clinicName']) || 'your clinic',
      doctorName: safeVoiceText(lead['doctorName']),
      city: safeVoiceText(lead['city'], 80),
      phone,
      attempts,
    };

    transaction.update(leadRef, {
      callConsent: 'granted',
      callConsentSource: consentSource,
      callConsentAt: consentAt,
      aiCallStatus: 'preparing',
      aiCallProvider: 'vapi',
      aiCallRequestId: requestId,
      aiCallPreparedAt: preparedAt,
      aiCallScheduledFor: timing === 'scheduled' ? callAt : FieldValue.delete(),
      aiCallError: FieldValue.delete(),
    });
  });

  if (!reservedLead) throw new RequestError(500, 'Could not prepare the AI call.');
  const lead = reservedLead as ReservedLead;
  let providerResponse: Response;
  let providerData: Record<string, unknown>;

  try {
    const providerRequest: Record<string, unknown> = {
      assistantId: config.assistantId,
      assistantVersion: config.assistantVersion,
      phoneNumberId: config.phoneNumberId,
      customer: {
        number: lead.phone,
        name: lead.clinicName,
      },
      assistantOverrides: {
        variableValues: {
          clinicName: lead.clinicName,
          doctorName: lead.doctorName || 'clinic owner',
          city: lead.city || 'India',
          openingScript: openingScript(lead),
          platformUrl: PLATFORM_URL,
          leadRequestId: requestId,
        },
      },
    };
    const schedulePlan = providerSchedulePlan(timing, schedule.scheduledAt);
    if (schedulePlan) providerRequest['schedulePlan'] = schedulePlan;
    providerResponse = await fetch(VAPI_CALL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(providerRequest),
    });
    const responseText = await providerResponse.text();
    providerData = asRecord(responseText ? JSON.parse(responseText) : {});
    if (!providerResponse.ok) {
      console.error('[lead-ai-call] Vapi rejected call:', providerResponse.status, responseText.slice(0, 500));
      throw new Error('The voice provider rejected the call request.');
    }
  } catch (error) {
    const message = error instanceof Error && error.message.includes('rejected')
      ? error.message
      : 'The voice provider could not be reached.';
    await markReservationFailed(leadRef, requestId, message);
    throw new RequestError(502, message);
  }

  const callId = cleanText(providerData['id'], 160);
  if (!/^[A-Za-z0-9_-]{8,160}$/.test(callId)) {
    await markReservationFailed(leadRef, requestId, 'The voice provider returned an invalid call ID.');
    throw new RequestError(502, 'The voice provider returned an invalid call ID.');
  }
  const providerStatus = mapProviderCallStatus(providerData['status']);
  const queuedStatus: LeadCallStatus = timing === 'now'
    ? 'queued'
    : providerStatus === 'queued' ? 'queued' : 'scheduled';

  const finalizeResult = await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(leadRef);
    if (!snapshot.exists) return 'superseded' as const;
    const current = snapshot.data() ?? {};
    if (current['aiCallRequestId'] !== requestId) return 'superseded' as const;
    if (
      current['doNotCall'] === true
      || current['callConsent'] === 'revoked'
      || ['cancelled', 'opted_out'].includes(cleanText(current['aiCallStatus'], 30))
    ) {
      transaction.update(leadRef, {
        aiCallProviderId: callId,
        aiCallPreparedAt: FieldValue.delete(),
      });
      return 'permission_changed' as const;
    }
    transaction.update(leadRef, {
      aiCallStatus: advanceCallStatus(current['aiCallStatus'], queuedStatus),
      aiCallProviderId: callId,
      aiCallAttempts: lead.attempts + 1,
      aiCallLastAttemptAt: callAt,
      aiCallPreparedAt: FieldValue.delete(),
    });
    transaction.set(leadRef.collection('activities').doc(`ai_call_${requestId}_queued`), {
      type: 'ai_call',
      note: timing === 'now'
        ? `AI call started manually; consent verified via ${consentSource}.`
        : `AI call scheduled manually for ${callAt}; consent verified via ${consentSource}.`,
      actorUid: actor.uid,
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return 'queued' as const;
  });

  if (finalizeResult !== 'queued') {
    try {
      await cancelProviderCall(callId, config.apiKey);
    } catch (error) {
      if (finalizeResult === 'permission_changed') {
        await leadRef.update({
          aiCallProviderId: callId,
          aiCallError: 'Provider cancellation requires manual attention.',
        });
      }
      throw error;
    }
    if (finalizeResult === 'permission_changed') {
      await leadRef.collection('activities').doc(`ai_call_${requestId}_cancelled`).set({
        type: 'ai_call',
        note: 'Provider call cancelled because permission changed while it was being queued.',
        actorUid: actor.uid,
        createdAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    throw new RequestError(409, 'The call was cancelled because the lead permission changed.');
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: true,
    callId,
    provider: 'vapi',
    status: queuedStatus,
    timing,
    callAt,
    ...(timing === 'scheduled' ? { scheduledFor: callAt } : {}),
    consentAt,
    attempts: lead.attempts + 1,
  });
}

async function controlCall(
  req: VercelRequest,
  res: VercelResponse,
  action: 'cancel' | 'do_not_call',
): Promise<VercelResponse> {
  const actor = await assertSuperAdmin(req);
  const body = asRecord(req.body);
  const leadId = cleanText(body['leadId'], 128);
  const reason = cleanText(body['reason'], 240)
    || (action === 'do_not_call' ? 'Lead requested no further calls.' : 'Call cancelled by an administrator.');
  if (!/^[A-Za-z0-9_-]+$/.test(leadId)) throw new RequestError(400, 'Choose a valid lead.');

  const leadRef = db.collection('leads').doc(leadId);
  const initialSnapshot = await leadRef.get();
  if (!initialSnapshot.exists) throw new RequestError(404, 'Lead not found.');
  const initial = initialSnapshot.data() ?? {};
  const initialStatus = cleanText(initial['aiCallStatus'], 30);
  const hasActiveCall = ACTIVE_CALL_STATUSES.has(initialStatus);
  const providerCallId = cleanText(initial['aiCallProviderId'], 160);

  if (action === 'cancel' && !hasActiveCall) {
    if (initialStatus === 'cancelled') {
      return res.status(200).json({ ok: true, status: 'cancelled', providerCallCancelled: false });
    }
    throw new RequestError(409, 'This lead does not have an active AI call.');
  }
  if (action === 'do_not_call' && initial['doNotCall'] === true && !hasActiveCall) {
    return res.status(200).json({ ok: true, status: 'opted_out', providerCallCancelled: false });
  }
  if (hasActiveCall && initialStatus !== 'preparing' && !providerCallId) {
    throw new RequestError(409, 'The active provider call could not be identified. Refresh and try again.');
  }

  if (hasActiveCall && providerCallId) await cancelProviderCall(providerCallId);

  const activityId = randomUUID();
  const resultStatus = await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(leadRef);
    if (!snapshot.exists) throw new RequestError(404, 'Lead not found.');
    const current = snapshot.data() ?? {};
    const currentStatus = cleanText(current['aiCallStatus'], 30);
    const currentProviderCallId = cleanText(current['aiCallProviderId'], 160);
    if (providerCallId && currentProviderCallId && currentProviderCallId !== providerCallId) {
      throw new RequestError(409, 'The active provider call changed. Refresh and try again.');
    }

    if (action === 'cancel') {
      if (!ACTIVE_CALL_STATUSES.has(currentStatus) && currentStatus !== 'cancelled') {
        throw new RequestError(409, 'The AI call ended before it could be cancelled. Refresh the pipeline.');
      }
      transaction.update(leadRef, {
        aiCallStatus: 'cancelled',
        aiCallPreparedAt: FieldValue.delete(),
        aiCallError: FieldValue.delete(),
      });
      transaction.set(leadRef.collection('activities').doc(`ai_call_cancel_${activityId}`), {
        type: 'ai_call',
        note: reason,
        actorUid: actor.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      return 'cancelled' as const;
    }

    transaction.update(leadRef, {
      callConsent: 'revoked',
      doNotCall: true,
      aiCallStatus: 'opted_out',
      aiCallLastOutcome: 'opted_out',
      aiCallSummary: reason,
      aiCallPreparedAt: FieldValue.delete(),
      aiCallError: FieldValue.delete(),
      status: 'lost',
    });
    transaction.set(leadRef.collection('activities').doc(`do_not_call_${activityId}`), {
      type: 'ai_call',
      note: `Do not call: ${reason}`,
      actorUid: actor.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    return 'opted_out' as const;
  });

  return res.status(200).json({
    ok: true,
    status: resultStatus,
    providerCallCancelled: hasActiveCall && !!providerCallId,
  });
}

async function recordCallConsent(req: VercelRequest, res: VercelResponse): Promise<VercelResponse> {
  const actor = await assertSuperAdmin(req);
  const body = asRecord(req.body);
  const leadId = cleanText(body['leadId'], 128);
  const consentSource = cleanText(body['reason'], 240);
  if (!/^[A-Za-z0-9_-]+$/.test(leadId)) throw new RequestError(400, 'Choose a valid lead.');
  if (consentSource.length < 3) throw new RequestError(400, 'Record where and when new call consent was received.');

  const leadRef = db.collection('leads').doc(leadId);
  const consentAt = new Date().toISOString();
  const activityId = randomUUID();
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(leadRef);
    if (!snapshot.exists) throw new RequestError(404, 'Lead not found.');
    const current = snapshot.data() ?? {};
    if (ACTIVE_CALL_STATUSES.has(cleanText(current['aiCallStatus'], 30))) {
      throw new RequestError(409, 'Resolve the active AI call before changing consent.');
    }
    if (
      current['doNotCall'] !== true
      && current['callConsent'] !== 'revoked'
      && current['aiCallStatus'] !== 'opted_out'
    ) {
      throw new RequestError(409, 'This lead is not currently opted out.');
    }
    const updates: Record<string, string | boolean | FieldValue> = {
      callConsent: 'granted',
      callConsentSource: consentSource,
      callConsentAt: consentAt,
      lastContactedAt: consentAt,
      doNotCall: false,
      aiCallStatus: 'ready',
      aiCallProviderId: FieldValue.delete(),
      aiCallRequestId: FieldValue.delete(),
      aiCallPreparedAt: FieldValue.delete(),
      aiCallScheduledFor: FieldValue.delete(),
      aiCallError: FieldValue.delete(),
    };
    if (current['status'] === 'lost') updates['status'] = 'contacted';
    transaction.update(leadRef, updates);
    transaction.set(leadRef.collection('activities').doc(`call_consent_${activityId}`), {
      type: 'ai_call',
      note: `New automated-call consent recorded: ${consentSource}`,
      actorUid: actor.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  return res.status(200).json({
    ok: true,
    status: 'ready',
    providerCallCancelled: false,
    consentAt,
  });
}

function verifyWebhook(req: VercelRequest, secret: string): boolean {
  const authorization = bearerToken(req);
  const legacySecret = headerValue(req.headers['x-vapi-secret']);
  const provided = authorization || legacySecret;
  return !!provided && secureEqual(provided, secret);
}

async function findLeadRef(callId: string, requestId: string): Promise<DocumentReference | null> {
  if (callId) {
    const byCall = await db.collection('leads').where('aiCallProviderId', '==', callId).limit(1).get();
    if (!byCall.empty) return byCall.docs[0].ref;
  }
  if (requestId) {
    const byRequest = await db.collection('leads').where('aiCallRequestId', '==', requestId).limit(1).get();
    if (!byRequest.empty) return byRequest.docs[0].ref;
  }
  return null;
}

function analysisValue(message: Record<string, unknown>, call: Record<string, unknown>): Record<string, unknown> {
  const messageAnalysis = asRecord(message['analysis']);
  return Object.keys(messageAnalysis).length ? messageAnalysis : asRecord(call['analysis']);
}

function structuredOutputValue(
  artifact: Record<string, unknown>,
  analysis: Record<string, unknown>,
): Record<string, unknown> {
  const legacy = asRecord(analysis['structuredData']);
  if (Object.keys(legacy).length) return legacy;

  const outputs = asRecord(artifact['structuredOutputs']);
  const merged: Record<string, unknown> = {};
  for (const output of Object.values(outputs)) {
    const result = asRecord(asRecord(output)['result']);
    if (!('outcome' in merged) && 'outcome' in result) merged['outcome'] = result['outcome'];
    if (!('summary' in merged) && 'summary' in result) merged['summary'] = result['summary'];
  }
  return merged;
}

function callSummary(
  analysis: Record<string, unknown>,
  structuredData: Record<string, unknown>,
  outcome: LeadCallOutcome,
): string {
  const summary = cleanText(analysis['summary'], 2_000) || cleanText(structuredData['summary'], 2_000);
  if (summary) return summary;
  const labels: Record<LeadCallOutcome, string> = {
    interested: 'The lead expressed interest. Review the call and follow up.',
    demo_booked: 'The lead agreed to a product demo.',
    callback_requested: 'The lead requested a follow-up call.',
    not_interested: 'The lead said they are not interested.',
    no_answer: 'The call was not answered.',
    voicemail: 'The call reached voicemail.',
    wrong_number: 'The number did not reach the intended lead.',
    opted_out: 'The lead asked not to receive further calls.',
    unknown: 'The call ended without a structured outcome.',
  };
  return labels[outcome];
}

function outcomeLeadStatus(outcome: LeadCallOutcome): string {
  if (outcome === 'interested') return 'interested';
  if (outcome === 'demo_booked') return 'demo';
  if (['not_interested', 'wrong_number', 'opted_out'].includes(outcome)) return 'lost';
  if (outcome === 'callback_requested') return 'contacted';
  return '';
}

function isFailedEndReason(value: string): boolean {
  return /(error|failed|failure|assistant-not-found|transport-never-connected)/i.test(value);
}

function isCancelledEndReason(value: string): boolean {
  return /(manually-canceled|scheduled-call-deleted|call-deleted)/i.test(value);
}

async function applyStatusWebhook(
  leadRef: DocumentReference,
  callId: string,
  requestId: string,
  providerStatus: LeadCallStatus,
): Promise<void> {
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(leadRef);
    if (!snapshot.exists) return;
    const current = snapshot.data() ?? {};
    if (!providerEventMatchesCall(
      current['aiCallProviderId'],
      current['aiCallRequestId'],
      callId,
      requestId,
    )) return;
    const updates: Record<string, string | boolean | number | FieldValue> = {
      aiCallStatus: advanceCallStatus(current['aiCallStatus'], providerStatus),
    };
    if (callId) updates['aiCallProviderId'] = callId;
    if (requestId && !current['aiCallRequestId']) updates['aiCallRequestId'] = requestId;
    if (providerStatus === 'in_progress') updates['lastContactedAt'] = new Date().toISOString();
    transaction.update(leadRef, updates);
  });
}

async function applyEndWebhook(
  leadRef: DocumentReference,
  callId: string,
  requestId: string,
  message: Record<string, unknown>,
  call: Record<string, unknown>,
): Promise<void> {
  const artifact = asRecord(message['artifact']);
  const analysis = analysisValue(message, call);
  const structuredData = structuredOutputValue(artifact, analysis);
  const endedReason = cleanText(message['endedReason'] ?? call['endedReason'], 160);
  const transcript = cleanText(artifact['transcript'], 30_000);
  const outcome = deriveCallOutcome(
    structuredData['outcome'] ?? analysis['outcome'],
    endedReason,
    transcript,
  );
  const summary = callSummary(analysis, structuredData, outcome);
  const callStatus: LeadCallStatus = outcome === 'opted_out'
    ? 'opted_out'
    : isCancelledEndReason(endedReason)
      ? 'cancelled'
      : isFailedEndReason(endedReason) ? 'failed' : 'completed';

  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(leadRef);
    if (!snapshot.exists) return;
    const current = snapshot.data() ?? {};
    if (!providerEventMatchesCall(
      current['aiCallProviderId'],
      current['aiCallRequestId'],
      callId,
      requestId,
    )) return;
    const currentStatus = cleanText(current['aiCallStatus'], 30);
    const preservesOptOut = current['doNotCall'] === true || currentStatus === 'opted_out';
    const effectiveStatus: LeadCallStatus = preservesOptOut
      ? 'opted_out'
      : currentStatus === 'cancelled' ? 'cancelled' : callStatus;
    const effectiveOutcome: LeadCallOutcome = preservesOptOut ? 'opted_out' : outcome;
    const effectiveSummary = preservesOptOut
      ? cleanText(current['aiCallSummary'], 2_000) || callSummary(analysis, structuredData, 'opted_out')
      : summary;
    const effectiveLeadStatus = outcomeLeadStatus(effectiveOutcome);
    const updates: Record<string, string | boolean | number | FieldValue> = {
      aiCallStatus: effectiveStatus,
      aiCallLastOutcome: effectiveOutcome,
      aiCallSummary: effectiveSummary,
      lastContactedAt: new Date().toISOString(),
      aiCallPreparedAt: FieldValue.delete(),
    };
    if (callId) updates['aiCallProviderId'] = callId;
    if (requestId && !current['aiCallRequestId']) updates['aiCallRequestId'] = requestId;
    if (effectiveLeadStatus) updates['status'] = effectiveLeadStatus;
    if (effectiveStatus === 'failed') updates['aiCallError'] = endedReason || 'Provider call failed.';
    else updates['aiCallError'] = FieldValue.delete();
    if (effectiveOutcome === 'opted_out') {
      updates['doNotCall'] = true;
      updates['callConsent'] = 'revoked';
    }
    transaction.update(leadRef, updates);
    transaction.set(leadRef.collection('activities').doc(`ai_call_${callId || requestId}_ended`), {
      type: 'ai_call',
      note: `AI call ended (${effectiveOutcome}): ${effectiveSummary}`.slice(0, 2_000),
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

async function webhook(req: VercelRequest, res: VercelResponse): Promise<VercelResponse> {
  if (!verifyWebhook(req, vapiWebhookSecret())) {
    throw new RequestError(401, 'Invalid voice provider signature.');
  }

  const message = asRecord(asRecord(req.body)['message']);
  const type = cleanText(message['type'], 80);
  const call = asRecord(message['call']);
  const callId = cleanText(call['id'], 160);
  const customer = asRecord(call['customer']);
  const overrides = asRecord(call['assistantOverrides']);
  const variableValues = asRecord(overrides['variableValues']);
  const requestId = cleanText(customer['leadRequestId'] ?? variableValues['leadRequestId'], 160);

  if (!callId && !requestId) return res.status(200).json({ ok: true, ignored: true });
  const leadRef = await findLeadRef(callId, requestId);
  if (!leadRef) {
    console.warn('[lead-ai-call] Webhook could not match call:', callId);
    return res.status(200).json({ ok: true, ignored: true });
  }

  if (type === 'status-update') {
    const providerStatus = mapProviderCallStatus(message['status'] ?? call['status']);
    if (providerStatus) await applyStatusWebhook(leadRef, callId, requestId, providerStatus);
  } else if (type === 'end-of-call-report') {
    await applyEndWebhook(leadRef, callId, requestId, message, call);
  }

  return res.status(200).json({ ok: true });
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<VercelResponse> {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  try {
    const action = requestAction(req);
    if (action === 'webhook') return await webhook(req, res);
    if (action === 'cancel') return await controlCall(req, res, 'cancel');
    if (action === 'do_not_call') return await controlCall(req, res, 'do_not_call');
    if (action === 'record_consent') return await recordCallConsent(req, res);
    if (action && action !== 'queue') throw new RequestError(400, 'Unknown AI call action.');
    return await queueCall(req, res);
  } catch (error) {
    if (error instanceof RequestError) return res.status(error.statusCode).json({ error: error.message });
    console.error('[lead-ai-call] Request failed:', error);
    return res.status(500).json({ error: 'AI call request failed.' });
  }
}