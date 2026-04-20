import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  buildAgentSystemPrompt,
  resolveVoiceAgentSettings,
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

  const settings = resolveVoiceAgentSettings(body, {
    voiceId: process.env['ELEVENLABS_VOICE_ID'],
  });
  const systemPrompt = buildAgentSystemPrompt(body, {
    language: settings.language,
    persona: settings.persona,
  });
  const clinicName = typeof body['name'] === 'string' && body['name'].trim()
    ? body['name'].trim().slice(0, 36)
    : clinicId;
  const webhookUrl = `${process.env['APP_BASE_URL'] ?? `https://${process.env['VERCEL_PROJECT_PRODUCTION_URL'] ?? process.env['VERCEL_URL']}`}/api/elevenlabs-webhook`;
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
        ? { webhook: { url: webhookUrl, secret: webhookSecret } }
        : { webhook: { url: webhookUrl } },
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    console.error('[elevenlabs-create-agent] API error:', details);
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
    console.error('[elevenlabs-create-agent] Firestore update failed:', error);
    return res.status(500).json({
      error: 'Agent created but Firestore update failed',
      agentId: agent.agent_id,
    });
  }

  return res.status(200).json({ agentId: agent.agent_id });
}
