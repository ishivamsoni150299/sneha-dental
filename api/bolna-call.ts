import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

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

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW = 60_000;

function cleanText(value: unknown, maxLength = 160): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function normalizeE164(value: unknown): string {
  const raw = cleanText(value, 32);
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  const withCountry = digits.startsWith('91') ? digits : `91${digits}`;
  return `+${withCountry}`;
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

async function assertSuperAdmin(idToken: unknown): Promise<string> {
  if (typeof idToken !== 'string' || !idToken.trim()) {
    throw new Error('Authentication required.');
  }

  const decoded = await auth.verifyIdToken(idToken);
  const admin = await db.collection('superAdmins').doc(decoded.uid).get();
  if (!admin.exists) {
    throw new Error('Super admin access required.');
  }
  return decoded.uid;
}

function addDaysIso(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().split('T')[0];
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<VercelResponse> {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const forwardedFor = req.headers['x-forwarded-for'];
  const ip = typeof forwardedFor === 'string'
    ? forwardedFor.split(',')[0].trim()
    : req.socket.remoteAddress ?? 'unknown';

  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many AI call requests. Please wait a minute.' });
  }

  const apiKey = process.env['BOLNA_API_KEY']?.trim();
  const agentId = process.env['BOLNA_AGENT_ID']?.trim();
  const fromPhoneNumber = normalizeE164(process.env['BOLNA_FROM_PHONE_NUMBER']);

  if (!apiKey || !agentId) {
    return res.status(500).json({
      error: 'Bolna is not configured. Set BOLNA_API_KEY and BOLNA_AGENT_ID in Vercel environment variables.',
    });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const leadId = cleanText(body['leadId'], 120);
  if (!leadId) {
    return res.status(400).json({ error: 'Lead ID is required.' });
  }

  let uid: string;
  try {
    uid = await assertSuperAdmin(body['idToken']);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unauthorized.';
    return res.status(401).json({ error: message });
  }

  const leadRef = db.collection('leads').doc(leadId);
  const leadSnap = await leadRef.get();
  if (!leadSnap.exists) {
    return res.status(404).json({ error: 'Lead not found.' });
  }

  const lead = leadSnap.data() ?? {};
  const recipientPhoneNumber = normalizeE164(lead['phone']);
  if (!recipientPhoneNumber) {
    return res.status(400).json({ error: 'Lead phone number is missing or invalid.' });
  }

  const clinicName = cleanText(lead['clinicName']) || 'the clinic';
  const doctorName = cleanText(lead['doctorName']);
  const city = cleanText(lead['city']);
  const area = cleanText(lead['area']);
  const categories = cleanText(lead['categories']);
  const rating = typeof lead['rating'] === 'number' ? String(lead['rating']) : '';
  const reviewCount = typeof lead['reviewCount'] === 'number' ? String(lead['reviewCount']) : '';
  const followUpDate = addDaysIso(1);
  const appBaseUrl = process.env['APP_BASE_URL']?.trim();

  const payload: Record<string, unknown> = {
    agent_id: agentId,
    recipient_phone_number: recipientPhoneNumber,
    user_data: {
      timezone: 'Asia/Kolkata',
      lead_id: leadId,
      clinic_name: clinicName,
      doctor_name: doctorName || 'Doctor',
      city,
      area,
      categories,
      rating,
      review_count: reviewCount,
      current_status: cleanText(lead['status'], 40) || 'new',
      platform_name: 'mydentalplatform',
      platform_url: appBaseUrl ?? 'https://www.mydentalplatform.com',
      demo_website_url: 'https://arogyamdental.mydentalplatform.com',
      demo_video_url: 'https://youtu.be/cJGhGCDmyAk?si=lzHGpFTOp9WtMxMX',
      setup_video_url: 'https://youtu.be/R7d1KqfdH6U?si=LM69y0o5dr5P132S',
      starter_price: '999 INR per month',
      pro_price: '2499 INR per month',
      human_contact_phone: '9140210648',
    },
  };

  if (fromPhoneNumber) {
    payload['from_phone_number'] = fromPhoneNumber;
  }

  try {
    const bolnaRes = await fetch('https://api.bolna.ai/call', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseText = await bolnaRes.text();
    let bolnaBody: Record<string, unknown> = {};
    try {
      bolnaBody = responseText ? JSON.parse(responseText) as Record<string, unknown> : {};
    } catch {
      bolnaBody = { raw: responseText };
    }

    if (!bolnaRes.ok) {
      console.error('[bolna-call] Bolna API failed:', bolnaRes.status, bolnaBody);
      return res.status(502).json({
        error: 'Bolna could not queue the call.',
        details: bolnaBody,
      });
    }

    const executionId = cleanText(
      bolnaBody['execution_id'] ?? bolnaBody['call_id'] ?? bolnaBody['id'],
      120,
    );
    const bolnaStatus = cleanText(bolnaBody['status'], 80) || 'queued';
    const currentStatus = cleanText(lead['status'], 40);
    const nextLeadStatus = currentStatus === 'new' ? 'contacted' : currentStatus;

    await leadRef.update({
      status: nextLeadStatus,
      followUpDate,
    });

    await leadRef.collection('activities').add({
      type: 'called',
      note: `Bolna AI call ${bolnaStatus}${executionId ? ` - execution ${executionId}` : ''}`,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: uid,
    });

    return res.status(200).json({
      ok: true,
      status: bolnaStatus,
      executionId,
      leadStatus: nextLeadStatus,
      followUpDate,
    });
  } catch (error) {
    console.error('[bolna-call] failed:', error);
    const message = error instanceof Error ? error.message : 'Failed to start Bolna AI call.';
    return res.status(500).json({ error: message });
  }
}
