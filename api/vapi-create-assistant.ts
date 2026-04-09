import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// ── Env vars needed in Vercel ─────────────────────────────────────────────────
// VAPI_API_KEY         → from Vapi Dashboard → Account → API Keys
// FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY (already set for Razorpay webhook)

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

function buildSystemPrompt(clinic: Record<string, unknown>): string {
  const name       = clinic['name']                as string ?? 'this clinic';
  const city       = clinic['city']                as string ?? '';
  const address    = `${clinic['addressLine1'] ?? ''}, ${clinic['city'] ?? ''}`;
  const doctor     = clinic['doctorName']          as string ?? 'the doctor';
  const qual       = clinic['doctorQualification'] as string ?? '';
  const phone      = clinic['phone']               as string ?? '';
  const hours      = (clinic['hours'] as Array<{ days: string; time: string }> ?? [])
    .map(h => `${h.days}: ${h.time}`).join(', ') || 'Please call to confirm hours';
  const services   = (clinic['services'] as Array<{ name: string; price: string }> ?? [])
    .map(s => `${s.name} (${s.price})`).join(', ') || 'General dentistry';

  return `You are an AI receptionist for ${name}, a dental clinic in ${city}.
Address: ${address}.
Doctor: ${doctor}${qual ? ` (${qual})` : ''}.
Clinic Hours: ${hours}.
Phone: ${phone}.
Services offered: ${services}.

LANGUAGE: Greet in Hindi. Switch to English if the patient speaks English. Hinglish is fine.

BOOKING: To book an appointment, collect:
1. Patient full name
2. Phone number
3. Preferred date and time
4. Service needed (or describe their problem)
After collecting: "Main aapka appointment book kar rahi hoon. Aapko WhatsApp pe confirmation aa jayega."

FAQs:
- Location: Give the address. Say "Google Maps pe '${name}' search karein."
- Pricing: Give approximate range from services list. Say "Exact quote appointment mein milega."
- Availability: "Specific slot ke liye WhatsApp karein: ${phone}"

STYLE: Warm, brief, professional. Max 2 sentences per response. No medical advice.
Never make up information. If unsure, say "Main confirm karke aapko batati hoon."

END CALL: "Shukriya! Aapka din accha ho. Goodbye!"`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const body     = req.body ?? {};
  const clinicId = body.clinicId as string | undefined;

  if (!clinicId) return res.status(400).json({ error: 'clinicId required' });

  const apiKey = process.env['VAPI_API_KEY'];
  if (!apiKey) return res.status(500).json({ error: 'VAPI_API_KEY not configured' });

  const systemPrompt = buildSystemPrompt(body);

  // Create Vapi assistant
  const vapiRes = await fetch('https://api.vapi.ai/assistant', {
    method:  'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name:         `${body.name ?? clinicId} Receptionist`,
      firstMessage: `Namaste! ${body.name ?? 'Clinic'} mein aapka swagat hai. Main aapki kaise madad kar sakti hoon?`,
      model: {
        provider: 'openai',
        model:    'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }],
        temperature: 0.4,
      },
      voice: {
        provider: '11labs',
        voiceId:  'Nzm9nWGETi0B0VFeMhgd',   // Indian English female (Priya)
        stability: 0.5,
        similarityBoost: 0.75,
      },
      serverUrl:    `${process.env['VERCEL_URL'] ? `https://${process.env['VERCEL_URL']}` : ''}/api/vapi-webhook`,
      serverUrlSecret: process.env['VAPI_WEBHOOK_SECRET'],
      metadata:    { clinicId },
      endCallMessage: 'Shukriya! Aapka din accha ho. Goodbye!',
      maxDurationSeconds: 600,   // 10 min max call
    }),
  });

  if (!vapiRes.ok) {
    const err = await vapiRes.text();
    console.error('Vapi create assistant error:', err);
    return res.status(500).json({ error: 'Failed to create Vapi assistant', details: err });
  }

  const assistant = await vapiRes.json() as { id: string };

  // Store vapiAssistantId in Firestore
  await db.collection('clinics').doc(clinicId).update({
    vapiAssistantId: assistant.id,
    vapiPublicKey:   process.env['VAPI_PUBLIC_KEY'] ?? '',
  });

  return res.status(200).json({ assistantId: assistant.id });
}
