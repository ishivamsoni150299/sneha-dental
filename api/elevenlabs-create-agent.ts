import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// ── Required Vercel env vars ───────────────────────────────────────────────────
// ELEVENLABS_API_KEY      → ElevenLabs dashboard → API Keys
// ELEVENLABS_VOICE_ID     → ElevenLabs voice ID (optional — defaults to Aria)
// ELEVENLABS_WEBHOOK_SECRET → random secret string shared with the webhook handler
// APP_BASE_URL            → e.g. "https://www.mydentalplatform.com"
// FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY (already set)

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
  const name    = (clinic['name']                as string) ?? 'this clinic';
  const city    = (clinic['city']                as string) ?? '';
  const address = `${clinic['addressLine1'] ?? ''}, ${clinic['city'] ?? ''}`;
  const doctor  = (clinic['doctorName']          as string) ?? 'the doctor';
  const qual    = (clinic['doctorQualification'] as string) ?? '';
  const phone   = (clinic['phone']               as string) ?? '';
  const hours   = (clinic['hours'] as Array<{ days: string; time: string }> ?? [])
    .map(h => `${h.days}: ${h.time}`).join(', ') || 'Please call to confirm hours';
  const services = (clinic['services'] as Array<{ name: string; price: string }> ?? [])
    .map(s => `${s.name} (${s.price})`).join(', ') || 'General dentistry';

  return `You are the AI receptionist for ${name}, a dental clinic located at ${address}, ${city}.

CLINIC KNOWLEDGE (the ONLY topics you are allowed to discuss):
- Clinic name: ${name}
- Doctor: ${doctor}${qual ? ` — ${qual}` : ''}
- Phone: ${phone}
- Address: ${address}
- Hours: ${hours}
- Services & pricing: ${services}

STRICT BOUNDARIES:
- You ONLY answer questions about ${name}. Never discuss other clinics, general health topics, medical diagnoses, medications, or anything unrelated to this clinic.
- If a patient asks anything outside the clinic's scope, say: "Mujhe sirf ${name} ke baare mein jaankari hai. Kya main aapka appointment book kar sakti hoon?"
- Never give medical advice, diagnoses, or treatment recommendations.
- Never mention competitor clinics.
- If information is not in this prompt, say: "Iske baare mein hum appointment pe baat kar sakte hain."

LANGUAGE: Start in Hindi. Switch to English naturally if the patient uses English. Hinglish is fine.

BOOKING FLOW (collect all four before confirming):
1. Patient's full name
2. Phone number
3. Preferred date and time
4. Service needed / problem description
Confirm with: "Main aapka appointment note kar rahi hoon — ${name} mein. WhatsApp pe confirmation aa jayega."

QUICK ANSWERS:
- Location: "${address}. Google Maps pe '${name}, ${city}' search karein."
- Pricing: Give the range from services above. Add: "Exact quote doctor ke saath appointment pe milega."
- Hours: State the hours directly from the clinic data above.
- Unavailable slots: "Specific timing ke liye please WhatsApp karein: ${phone}"

STYLE: Warm, concise, professional. Maximum 2 sentences per reply. No filler words.
START: Greet with the clinic name. Example: "Namaste! ${name} mein aapka swagat hai. Main aapki kaise madad kar sakti hoon?"
END CALL: "Shukriya! ${name} ki taraf se aapka bahut bahut dhanyavaad. Aapka din shubh ho!"`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const body     = req.body ?? {};
  const clinicId = body.clinicId as string | undefined;
  if (!clinicId) return res.status(400).json({ error: 'clinicId required' });

  const apiKey = process.env['ELEVENLABS_API_KEY'];
  if (!apiKey) return res.status(500).json({ error: 'ELEVENLABS_API_KEY not configured' });

  const voiceId      = process.env['ELEVENLABS_VOICE_ID'] ?? '9BWtsMINqrJLrRacOk9x'; // Aria — multilingual
  const webhookUrl   = `${process.env['APP_BASE_URL'] ?? `https://${process.env['VERCEL_PROJECT_PRODUCTION_URL'] ?? process.env['VERCEL_URL']}`}/api/elevenlabs-webhook`;
  const webhookSecret = process.env['ELEVENLABS_WEBHOOK_SECRET'] ?? '';

  const systemPrompt  = buildSystemPrompt(body);
  const clinicName    = (body.name as string ?? clinicId).slice(0, 36);

  // Create ElevenLabs Conversational AI agent
  const elRes = await fetch('https://api.elevenlabs.io/v1/convai/agents/create', {
    method:  'POST',
    headers: {
      'xi-api-key':   apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: `${clinicName} — AI Receptionist`,
      conversation_config: {
        agent: {
          prompt: {
            prompt:      systemPrompt,
            llm:         'gemini-2.0-flash',
            temperature: 0.5,
            max_tokens:  800,
          },
          first_message: `Namaste! ${body.name ?? 'Clinic'} mein aapka swagat hai. Main aapki kaise madad kar sakti hoon?`,
          language: 'hi',   // Hindi primary — agent will switch based on user's language
        },
        tts: {
          voice_id: voiceId,
          model_id: 'eleven_multilingual_v2',   // supports Hindi, English, Hinglish
        },
        conversation: {
          max_duration_seconds: 600,   // 10 min max call
        },
      },
      platform_settings: {
        ...(webhookSecret
          ? { webhook: { url: webhookUrl, secret: webhookSecret } }
          : { webhook: { url: webhookUrl } }
        ),
      },
    }),
  });

  if (!elRes.ok) {
    const err = await elRes.text();
    console.error('[elevenlabs-create-agent] API error:', err);
    return res.status(500).json({ error: 'Failed to create ElevenLabs agent', details: err });
  }

  const agent = await elRes.json() as { agent_id: string };

  try {
    await db.collection('clinics').doc(clinicId).update({
      elevenLabsAgentId: agent.agent_id,
      // Remove old Vapi fields if they exist
      vapiAssistantId: null,
      vapiPublicKey:   null,
    });
  } catch (err) {
    console.error('[elevenlabs-create-agent] Firestore update failed:', err);
    return res.status(500).json({
      error:   'Agent created but Firestore update failed',
      agentId: agent.agent_id,
    });
  }

  return res.status(200).json({ agentId: agent.agent_id });
}
