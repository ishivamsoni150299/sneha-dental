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

// GET /api/elevenlabs-usage?clinicId=xxx
// Returns: { conversations: number, minutesUsed: number, minutesLimit: number }
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  const clinicId = req.query['clinicId'] as string | undefined;
  if (!clinicId) return res.status(400).json({ error: 'clinicId required' });

  const apiKey = process.env['ELEVENLABS_API_KEY'];
  if (!apiKey) return res.status(500).json({ error: 'ELEVENLABS_API_KEY not configured' });

  const doc = await db.collection('clinics').doc(clinicId).get();
  if (!doc.exists) return res.status(404).json({ error: 'Clinic not found' });

  const agentId = (doc.data() as Record<string, unknown>)['elevenLabsAgentId'] as string | undefined;
  if (!agentId) return res.status(200).json({ conversations: 0, minutesUsed: 0, minutesLimit: 60 });

  // Fetch conversation history for this agent (current month)
  const startOfMonth = new Date();
  startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);

  const convRes = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversations?agent_id=${agentId}&page_size=100`,
    { headers: { 'xi-api-key': apiKey } }
  );

  if (!convRes.ok) {
    console.error('[elevenlabs-usage] API error:', await convRes.text());
    return res.status(200).json({ conversations: 0, minutesUsed: 0, minutesLimit: 60 });
  }

  const data = await convRes.json() as {
    conversations: Array<{ start_time_unix_secs?: number; call_duration_secs?: number; status?: string }>;
  };

  const startUnix = startOfMonth.getTime() / 1000;
  const thisMonth = (data.conversations ?? []).filter(
    c => (c.start_time_unix_secs ?? 0) >= startUnix
  );

  const totalSecs = thisMonth.reduce((sum, c) => sum + (c.call_duration_secs ?? 0), 0);
  const minutesUsed = Math.round(totalSecs / 60);

  return res.status(200).json({
    conversations: thisMonth.length,
    minutesUsed,
    minutesLimit: 60,    // Pro plan included minutes
  });
}
