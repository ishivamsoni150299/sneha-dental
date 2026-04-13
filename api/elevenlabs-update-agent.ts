import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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

// POST /api/elevenlabs-update-agent
// Body: { clinicId, greeting?, language?, persona? }
// Updates the ElevenLabs agent + saves customisation to Firestore.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const body     = req.body ?? {};
  const clinicId = body.clinicId as string | undefined;
  if (!clinicId) return res.status(400).json({ error: 'clinicId required' });

  const apiKey = process.env['ELEVENLABS_API_KEY'];
  if (!apiKey) return res.status(500).json({ error: 'ELEVENLABS_API_KEY not configured' });

  // Fetch clinic to get existing agentId
  const doc = await db.collection('clinics').doc(clinicId).get();
  if (!doc.exists) return res.status(404).json({ error: 'Clinic not found' });
  const clinic = doc.data() as Record<string, unknown>;
  const agentId = clinic['elevenLabsAgentId'] as string | undefined;
  if (!agentId) return res.status(400).json({ error: 'No ElevenLabs agent for this clinic. Create one first.' });

  // Build PATCH payload from request body
  const greeting: string | undefined = body.greeting;
  const language: 'hindi' | 'english' | 'bilingual' | undefined = body.language;
  const persona:  string | undefined = body.persona;

  // Map language to ElevenLabs locale
  const langCode = language === 'english' ? 'en' : 'hi'; // hi covers Hinglish/bilingual

  // Build agent patch — only include fields that were provided
  const agentPatch: Record<string, unknown> = {};
  const convConfig: Record<string, unknown> = {};
  const agentConfig: Record<string, unknown> = {};

  if (greeting !== undefined) {
    agentConfig['first_message'] = greeting.trim() || `Namaste! ${clinic['name'] ?? 'Clinic'} mein aapka swagat hai. Kaise madad kar sakti hoon?`;
  }
  if (language !== undefined) {
    agentConfig['language'] = langCode;
  }
  if (persona !== undefined && persona.trim()) {
    // Merge persona note into agent instructions
    agentConfig['prompt'] = {
      prompt: `${persona.trim()}\n\nYou are an AI receptionist for ${clinic['name'] ?? 'this dental clinic'}.`,
    };
  }

  if (Object.keys(agentConfig).length > 0) {
    convConfig['agent'] = agentConfig;
  }
  if (Object.keys(convConfig).length > 0) {
    agentPatch['conversation_config'] = convConfig;
  }

  if (Object.keys(agentPatch).length === 0) {
    return res.status(400).json({ error: 'Nothing to update — provide at least greeting, language, or persona.' });
  }

  // PATCH the ElevenLabs agent
  const elRes = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
    method:  'PATCH',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body:    JSON.stringify(agentPatch),
  });

  if (!elRes.ok) {
    const err = await elRes.text();
    console.error('[elevenlabs-update-agent] API error:', err);
    return res.status(500).json({ error: 'Failed to update ElevenLabs agent', details: err });
  }

  // Persist customisation to Firestore so UI reflects current state
  const firestoreUpdate: Record<string, unknown> = {};
  if (greeting  !== undefined) firestoreUpdate['voiceAgentGreeting']  = greeting;
  if (language  !== undefined) firestoreUpdate['voiceAgentLanguage']  = language;
  if (persona   !== undefined) firestoreUpdate['voiceAgentPersona']   = persona;

  await db.collection('clinics').doc(clinicId).update(firestoreUpdate);

  return res.status(200).json({ ok: true });
}
