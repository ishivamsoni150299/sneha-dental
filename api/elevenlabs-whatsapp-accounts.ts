import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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

interface ElevenLabsWhatsappAccount {
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const clinicId = typeof req.query['clinicId'] === 'string' ? req.query['clinicId'] : '';
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

  const data = await response.json() as { items?: ElevenLabsWhatsappAccount[] };
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
