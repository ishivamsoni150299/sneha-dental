import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  buildAgentSystemPrompt,
  normalizeVoiceLanguage,
  resolveVoiceAgentSettings,
  sanitizeWhatsappPhoneNumberId,
} from './_lib/elevenlabs-agent-config';

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

interface WhatsappAccountResponse {
  business_account_id: string;
  business_account_name: string;
  phone_number_id: string;
  phone_number_name: string;
  phone_number: string;
  assigned_agent_id: string | null;
  assigned_agent_name: string | null;
  enable_messaging: boolean | null;
  enable_audio_message_response: boolean | null;
  is_token_expired?: boolean;
}

interface ElevenLabsToolResponse {
  id?: string;
  tool_id?: string;
  tool?: {
    id?: string;
    tool_id?: string;
  };
}

interface VoiceBookingToolContext {
  toolId: string;
  enabled: boolean;
}

function getAction(req: VercelRequest): string {
  const queryAction = typeof req.query['action'] === 'string' ? req.query['action'] : '';
  const body = (req.body ?? {}) as Record<string, unknown>;
  const bodyAction = typeof body['action'] === 'string' ? body['action'] : '';
  return (queryAction || bodyAction).trim();
}

function getClinicId(req: VercelRequest): string {
  const queryClinicId = typeof req.query['clinicId'] === 'string' ? req.query['clinicId'] : '';
  const body = (req.body ?? {}) as Record<string, unknown>;
  const bodyClinicId = typeof body['clinicId'] === 'string' ? body['clinicId'] : '';
  return (queryClinicId || bodyClinicId).trim();
}

function getApiKey(res: VercelResponse): string | null {
  const apiKey = process.env['ELEVENLABS_API_KEY'];
  if (!apiKey) {
    res.status(500).json({ error: 'ELEVENLABS_API_KEY not configured' });
    return null;
  }
  return apiKey;
}

function getWebhookUrl(): string {
  return `${getPublicBaseUrl()}/api/elevenlabs-webhook`;
}

function getPublicBaseUrl(): string {
  const configured = process.env['APP_BASE_URL']
    ?? process.env['VERCEL_PROJECT_PRODUCTION_URL']
    ?? process.env['VERCEL_URL']
    ?? 'http://localhost:4200';
  const baseUrl = /^https?:\/\//i.test(configured) ? configured : `https://${configured}`;
  return baseUrl.replace(/\/+$/, '');
}

function getVoiceActionUrl(clinicId: string): string {
  return `${getPublicBaseUrl()}/api/voice-booking-action?clinicId=${encodeURIComponent(clinicId)}`;
}

function getVoiceActionSecret(): string {
  return (process.env['VOICE_ACTION_SECRET'] || process.env['ELEVENLABS_WEBHOOK_SECRET'] || '').trim();
}

function getClinicName(clinicId: string, clinic: Record<string, unknown>): string {
  return typeof clinic['name'] === 'string' && clinic['name'].trim()
    ? clinic['name'].trim().slice(0, 36)
    : clinicId;
}

function getBookingRefPrefix(clinicId: string, clinic: Record<string, unknown>): string {
  const configured = typeof clinic['bookingRefPrefix'] === 'string' ? clinic['bookingRefPrefix'].trim() : '';
  const fallback = clinicId.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase();
  return (configured || fallback || 'VOICE').slice(0, 16);
}

function extractToolId(data: ElevenLabsToolResponse): string {
  return data.id ?? data.tool_id ?? data.tool?.id ?? data.tool?.tool_id ?? '';
}

function buildVoiceBookingToolConfig(
  clinicId: string,
  clinicName: string,
  bookingRefPrefix: string,
): Record<string, unknown> {
  const secret = getVoiceActionSecret();
  const requestHeaders = secret ? { 'x-voice-action-secret': secret } : {};

  return {
    tool_config: {
      type: 'webhook',
      name: 'submit_voice_booking_request',
      description: `Submit a pending dental appointment request for ${clinicName}. Use only after collecting patient name, phone number, treatment or issue, preferred date, and preferred time.`,
      response_timeout_secs: 20,
      disable_interruptions: true,
      force_pre_tool_speech: false,
      execution_mode: 'immediate',
      api_schema: {
        url: getVoiceActionUrl(clinicId),
        method: 'POST',
        request_headers: requestHeaders,
        content_type: 'application/json',
        request_body_schema: {
          type: 'object',
          required: ['bookingRefPrefix', 'name', 'phone', 'service', 'preferredDate', 'preferredTime'],
          properties: {
            bookingRefPrefix: {
              type: 'string',
              constant_value: bookingRefPrefix,
              description: 'Internal booking reference prefix.',
            },
            name: {
              type: 'string',
              description: 'Patient full name.',
            },
            phone: {
              type: 'string',
              description: 'Patient mobile or WhatsApp number.',
            },
            email: {
              type: 'string',
              description: 'Patient email if they shared it.',
            },
            service: {
              type: 'string',
              description: 'Dental treatment, service, or issue the patient wants help with.',
            },
            preferredDate: {
              type: 'string',
              description: 'Preferred appointment date. Use YYYY-MM-DD when clear, otherwise pass the patient phrase.',
            },
            preferredTime: {
              type: 'string',
              description: 'Preferred appointment time. Use HH:mm when clear, otherwise pass the patient phrase.',
            },
            message: {
              type: 'string',
              description: 'Short note with patient concern, urgency, or context.',
            },
          },
        },
      },
    },
  };
}

async function createVoiceBookingTool(
  apiKey: string,
  clinicId: string,
  clinic: Record<string, unknown>,
): Promise<string> {
  const response = await fetch('https://api.elevenlabs.io/v1/convai/tools', {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildVoiceBookingToolConfig(
      clinicId,
      getClinicName(clinicId, clinic),
      getBookingRefPrefix(clinicId, clinic),
    )),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || 'Failed to create ElevenLabs voice booking tool');
  }

  const data = await response.json() as ElevenLabsToolResponse;
  const toolId = extractToolId(data);
  if (!toolId) throw new Error('ElevenLabs did not return a voice booking tool id');
  return toolId;
}

async function ensureVoiceBookingTool(
  apiKey: string,
  clinicId: string,
  clinic: Record<string, unknown>,
): Promise<VoiceBookingToolContext> {
  const existingToolId = typeof clinic['elevenLabsBookingToolId'] === 'string'
    ? clinic['elevenLabsBookingToolId'].trim()
    : '';

  if (existingToolId) {
    return { toolId: existingToolId, enabled: true };
  }

  try {
    const toolId = await createVoiceBookingTool(apiKey, clinicId, clinic);
    try {
      await db.collection('clinics').doc(clinicId).update({
        elevenLabsBookingToolId: toolId,
        voiceActionEnabled: true,
      });
    } catch (error) {
      console.warn('[elevenlabs] voice booking tool created but Firestore update failed:', error);
    }
    return { toolId, enabled: true };
  } catch (error) {
    console.error('[elevenlabs] voice booking tool setup failed:', error);
    return { toolId: '', enabled: false };
  }
}

function hasOwn(body: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function asOptionalString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

async function patchWhatsappAccount(
  apiKey: string,
  phoneNumberId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const response = await fetch(`https://api.elevenlabs.io/v1/convai/whatsapp-accounts/${phoneNumberId}`, {
    method: 'PATCH',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || 'Failed to update WhatsApp account');
  }
}

async function getWhatsappAccount(
  apiKey: string,
  phoneNumberId: string,
): Promise<WhatsappAccountResponse | null> {
  const response = await fetch(`https://api.elevenlabs.io/v1/convai/whatsapp-accounts/${phoneNumberId}`, {
    headers: { 'xi-api-key': apiKey },
  });

  if (!response.ok) {
    return null;
  }

  return await response.json() as WhatsappAccountResponse;
}

async function handleCreateAgent(req: VercelRequest, res: VercelResponse): Promise<VercelResponse> {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const clinicId = getClinicId(req);
  if (!clinicId) {
    return res.status(400).json({ error: 'clinicId required' });
  }

  const apiKey = getApiKey(res);
  if (!apiKey) return res;

  const body = (req.body ?? {}) as Record<string, unknown>;
  const settings = resolveVoiceAgentSettings(body, {
    voiceId: process.env['ELEVENLABS_VOICE_ID'],
  });
  const voiceBookingTool = await ensureVoiceBookingTool(apiKey, clinicId, body);
  const systemPrompt = buildAgentSystemPrompt(body, {
    language: settings.language,
    persona: settings.persona,
    voiceActionEnabled: voiceBookingTool.enabled,
  });
  const clinicName = getClinicName(clinicId, body);
  const webhookSecret = process.env['ELEVENLABS_WEBHOOK_SECRET'] ?? '';

  const response = await fetch('https://api.elevenlabs.io/v1/convai/agents/create', {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: `${clinicName} - AI Receptionist`,
      conversation_config: {
        agent: {
          prompt: {
            prompt: systemPrompt,
            llm: 'gemini-2.0-flash',
            temperature: 0.5,
            max_tokens: 800,
            tool_ids: voiceBookingTool.toolId ? [voiceBookingTool.toolId] : [],
          },
          first_message: settings.greeting,
          language: settings.languageCode,
        },
        tts: {
          voice_id: settings.voiceId,
          model_id: 'eleven_multilingual_v2',
        },
        conversation: {
          max_duration_seconds: 600,
        },
      },
      platform_settings: webhookSecret
        ? { webhook: { url: getWebhookUrl(), secret: webhookSecret } }
        : { webhook: { url: getWebhookUrl() } },
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    console.error('[elevenlabs] create-agent API error:', details);
    return res.status(500).json({
      error: 'Failed to create ElevenLabs agent',
      details,
    });
  }

  const agent = await response.json() as { agent_id: string };

  try {
    await db.collection('clinics').doc(clinicId).update({
      elevenLabsAgentId: agent.agent_id,
      vapiAssistantId: null,
      vapiPublicKey: null,
    });
  } catch (error) {
    console.error('[elevenlabs] create-agent Firestore update failed:', error);
    return res.status(500).json({
      error: 'Agent created but Firestore update failed',
      agentId: agent.agent_id,
    });
  }

  return res.status(200).json({ agentId: agent.agent_id });
}

async function handleUpdateAgent(req: VercelRequest, res: VercelResponse): Promise<VercelResponse> {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const clinicId = getClinicId(req);
  if (!clinicId) {
    return res.status(400).json({ error: 'clinicId required' });
  }

  const apiKey = getApiKey(res);
  if (!apiKey) return res;

  const body = (req.body ?? {}) as Record<string, unknown>;
  const clinicDoc = await db.collection('clinics').doc(clinicId).get();
  if (!clinicDoc.exists) {
    return res.status(404).json({ error: 'Clinic not found' });
  }

  const clinic = clinicDoc.data() as Record<string, unknown>;
  const agentId = typeof clinic['elevenLabsAgentId'] === 'string' ? clinic['elevenLabsAgentId'] : '';
  if (!agentId) {
    return res.status(400).json({ error: 'No ElevenLabs agent for this clinic. Create one first.' });
  }

  const hasGreeting = hasOwn(body, 'greeting');
  const hasLanguage = hasOwn(body, 'language');
  const hasPersona = hasOwn(body, 'persona');
  const hasVoiceId = hasOwn(body, 'voiceId');
  const hasWhatsapp = hasOwn(body, 'whatsappPhoneNumberId') || hasOwn(body, 'whatsapp');

  if (!hasGreeting && !hasLanguage && !hasPersona && !hasVoiceId && !hasWhatsapp) {
    return res.status(400).json({ error: 'Nothing to update.' });
  }

  const greetingInput = hasGreeting ? asOptionalString(body['greeting']) : undefined;
  const languageInput = hasLanguage ? normalizeVoiceLanguage(body['language']) : undefined;
  const personaInput = hasPersona ? asOptionalString(body['persona']) : undefined;
  const voiceIdInput = hasVoiceId ? asOptionalString(body['voiceId']) : undefined;
  const nextWhatsappPhoneNumberId = hasWhatsapp
    ? sanitizeWhatsappPhoneNumberId(body['whatsappPhoneNumberId'] ?? body['whatsapp'])
    : undefined;
  const previousWhatsappPhoneNumberId = sanitizeWhatsappPhoneNumberId(clinic['voiceAgentWhatsapp']);

  const settings = resolveVoiceAgentSettings(clinic, {
    greeting: greetingInput,
    language: languageInput,
    persona: personaInput,
    voiceId: voiceIdInput,
  });
  const voiceBookingTool = await ensureVoiceBookingTool(apiKey, clinicId, clinic);

  const response = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
    method: 'PATCH',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      conversation_config: {
        agent: {
          first_message: settings.greeting,
          language: settings.languageCode,
          prompt: {
            prompt: buildAgentSystemPrompt(clinic, {
              language: settings.language,
              persona: settings.persona,
              voiceActionEnabled: voiceBookingTool.enabled,
            }),
            llm: 'gemini-2.0-flash',
            temperature: 0.5,
            max_tokens: 800,
            tool_ids: voiceBookingTool.toolId ? [voiceBookingTool.toolId] : [],
          },
        },
        tts: {
          voice_id: settings.voiceId,
          model_id: 'eleven_multilingual_v2',
        },
      },
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    console.error('[elevenlabs] update-agent API error:', details);
    return res.status(500).json({
      error: 'Failed to update ElevenLabs agent',
      details,
    });
  }

  let whatsappAccount: WhatsappAccountResponse | null = null;

  if (hasWhatsapp) {
    if (previousWhatsappPhoneNumberId && previousWhatsappPhoneNumberId !== nextWhatsappPhoneNumberId) {
      try {
        await patchWhatsappAccount(apiKey, previousWhatsappPhoneNumberId, {
          assigned_agent_id: null,
        });
      } catch (error) {
        console.warn('[elevenlabs] Failed to detach previous WhatsApp account:', error);
      }
    }

    if (nextWhatsappPhoneNumberId) {
      try {
        await patchWhatsappAccount(apiKey, nextWhatsappPhoneNumberId, {
          assigned_agent_id: agentId,
          enable_messaging: true,
        });
        whatsappAccount = await getWhatsappAccount(apiKey, nextWhatsappPhoneNumberId);
      } catch (error) {
        const details = error instanceof Error ? error.message : 'Failed to connect WhatsApp account';
        return res.status(500).json({
          error: 'Failed to update WhatsApp AI channel',
          details,
        });
      }
    }
  }

  const firestoreUpdate: Record<string, unknown> = {};
  if (hasGreeting) firestoreUpdate['voiceAgentGreeting'] = greetingInput || null;
  if (hasLanguage) firestoreUpdate['voiceAgentLanguage'] = settings.language;
  if (hasPersona) firestoreUpdate['voiceAgentPersona'] = personaInput || null;
  if (hasVoiceId) firestoreUpdate['voiceAgentVoiceId'] = settings.voiceId;
  if (hasWhatsapp) firestoreUpdate['voiceAgentWhatsapp'] = nextWhatsappPhoneNumberId || null;

  if (Object.keys(firestoreUpdate).length > 0) {
    await db.collection('clinics').doc(clinicId).update(firestoreUpdate);
  }

  return res.status(200).json({
    ok: true,
    whatsappAccountId: nextWhatsappPhoneNumberId || null,
    whatsappAccount: whatsappAccount
      ? {
          phoneNumberId: whatsappAccount.phone_number_id,
          phoneNumber: whatsappAccount.phone_number,
          phoneNumberName: whatsappAccount.phone_number_name,
          businessAccountName: whatsappAccount.business_account_name,
          assignedAgentId: whatsappAccount.assigned_agent_id,
          assignedAgentName: whatsappAccount.assigned_agent_name,
          enableMessaging: whatsappAccount.enable_messaging,
          enableAudioMessageResponse: whatsappAccount.enable_audio_message_response,
          isTokenExpired: whatsappAccount.is_token_expired ?? false,
        }
      : null,
  });
}

async function handleUsage(req: VercelRequest, res: VercelResponse): Promise<VercelResponse> {
  if (req.method !== 'GET') return res.status(405).end();

  const clinicId = getClinicId(req);
  if (!clinicId) return res.status(400).json({ error: 'clinicId required' });

  const apiKey = getApiKey(res);
  if (!apiKey) return res;

  const clinicDoc = await db.collection('clinics').doc(clinicId).get();
  if (!clinicDoc.exists) return res.status(404).json({ error: 'Clinic not found' });

  const clinicData = clinicDoc.data() as Record<string, unknown>;
  const agentId = clinicData['elevenLabsAgentId'] as string | undefined;
  if (!agentId) return res.status(200).json({ conversations: 0, minutesUsed: 0, minutesLimit: 30 });

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const convRes = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversations?agent_id=${agentId}&page_size=100`,
    { headers: { 'xi-api-key': apiKey } },
  );

  if (!convRes.ok) {
    console.error('[elevenlabs] usage API error:', await convRes.text());
    return res.status(200).json({ conversations: 0, minutesUsed: 0, minutesLimit: 30 });
  }

  const data = await convRes.json() as {
    conversations: Array<{ start_time_unix_secs?: number; call_duration_secs?: number }>;
  };

  const startUnix = startOfMonth.getTime() / 1000;
  const thisMonth = (data.conversations ?? []).filter(c => (c.start_time_unix_secs ?? 0) >= startUnix);
  const totalSecs = thisMonth.reduce((sum, c) => sum + (c.call_duration_secs ?? 0), 0);
  const minutesUsed = Math.round(totalSecs / 60);

  const minutesLimit = 30;
  const voiceBudgetCap = (clinicData['voiceBudgetCap'] as number | undefined) ?? 1000;
  const voiceAutoStop = (clinicData['voiceAutoStop'] as boolean | undefined) ?? true;
  const overageRate = 20;
  const maxOverageMin = Math.floor(voiceBudgetCap / overageRate);
  const hardLimit = minutesLimit + maxOverageMin;
  const overageMinutes = Math.max(0, minutesUsed - minutesLimit);
  const overageCost = overageMinutes * overageRate;

  return res.status(200).json({
    conversations: thisMonth.length,
    minutesUsed,
    minutesLimit,
    voiceBudgetCap,
    voiceAutoStop,
    overageRate,
    overageMinutes,
    overageCost,
    hardLimit,
    limitReached: voiceAutoStop && minutesUsed >= hardLimit,
  });
}

async function handleWhatsappAccounts(req: VercelRequest, res: VercelResponse): Promise<VercelResponse> {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const clinicId = getClinicId(req);
  if (!clinicId) {
    return res.status(400).json({ error: 'clinicId required' });
  }

  const apiKey = getApiKey(res);
  if (!apiKey) return res;

  const clinicDoc = await db.collection('clinics').doc(clinicId).get();
  if (!clinicDoc.exists) {
    return res.status(404).json({ error: 'Clinic not found' });
  }

  const clinic = clinicDoc.data() as Record<string, unknown>;
  const agentId = typeof clinic['elevenLabsAgentId'] === 'string' ? clinic['elevenLabsAgentId'] : '';
  const storedWhatsappId = typeof clinic['voiceAgentWhatsapp'] === 'string'
    ? clinic['voiceAgentWhatsapp']
    : '';

  const response = await fetch('https://api.elevenlabs.io/v1/convai/whatsapp-accounts', {
    headers: { 'xi-api-key': apiKey },
  });

  if (!response.ok) {
    const details = await response.text();
    return res.status(500).json({
      error: 'Failed to fetch WhatsApp accounts from ElevenLabs',
      details,
    });
  }

  const data = await response.json() as { items?: WhatsappAccountResponse[] };
  const items = (data.items ?? []).map(account => ({
    phoneNumberId: account.phone_number_id,
    phoneNumber: account.phone_number,
    phoneNumberName: account.phone_number_name,
    businessAccountName: account.business_account_name,
    assignedAgentId: account.assigned_agent_id,
    assignedAgentName: account.assigned_agent_name,
    enableMessaging: account.enable_messaging ?? true,
    enableAudioMessageResponse: account.enable_audio_message_response ?? true,
    isTokenExpired: account.is_token_expired ?? false,
    connectedToCurrentAgent: !!agentId && account.assigned_agent_id === agentId,
  }));

  const current = items.find(item => item.connectedToCurrentAgent)
    ?? items.find(item => item.phoneNumberId === storedWhatsappId)
    ?? null;

  return res.status(200).json({
    items,
    currentPhoneNumberId: current?.phoneNumberId ?? storedWhatsappId ?? null,
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<VercelResponse> {
  const action = getAction(req);

  if (action === 'create-agent') return handleCreateAgent(req, res);
  if (action === 'update-agent') return handleUpdateAgent(req, res);
  if (action === 'usage') return handleUsage(req, res);
  if (action === 'whatsapp-accounts') return handleWhatsappAccounts(req, res);

  return res.status(400).json({ error: 'Unknown ElevenLabs action' });
}
