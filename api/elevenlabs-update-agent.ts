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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const clinicId = typeof body['clinicId'] === 'string' ? body['clinicId'] : '';
  if (!clinicId) {
    return res.status(400).json({ error: 'clinicId required' });
  }

  const apiKey = process.env['ELEVENLABS_API_KEY'];
  if (!apiKey) {
    return res.status(500).json({ error: 'ELEVENLABS_API_KEY not configured' });
  }

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

  const agentPatch = {
    conversation_config: {
      agent: {
        first_message: settings.greeting,
        language: settings.languageCode,
        prompt: {
          prompt: buildAgentSystemPrompt(clinic, {
            language: settings.language,
            persona: settings.persona,
          }),
          llm: 'gemini-2.0-flash',
          temperature: 0.5,
          max_tokens: 800,
        },
      },
      tts: {
        voice_id: settings.voiceId,
        model_id: 'eleven_multilingual_v2',
      },
    },
  };

  const response = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
    method: 'PATCH',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(agentPatch),
  });

  if (!response.ok) {
    const details = await response.text();
    console.error('[elevenlabs-update-agent] API error:', details);
    return res.status(500).json({
      error: 'Failed to update ElevenLabs agent',
      details,
    });
  }

  let whatsappAccount: WhatsappAccountResponse | null = null;

  if (hasWhatsapp) {
    if (
      previousWhatsappPhoneNumberId &&
      previousWhatsappPhoneNumberId !== nextWhatsappPhoneNumberId
    ) {
      try {
        await patchWhatsappAccount(apiKey, previousWhatsappPhoneNumberId, {
          assigned_agent_id: null,
        });
      } catch (error) {
        console.warn('[elevenlabs-update-agent] Failed to detach previous WhatsApp account:', error);
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
