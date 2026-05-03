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
const MYDENTAL_RETELL_AGENT_ID = 'agent_347c0cd630b6ae7810d4c9b1fe';
const VOBIZ_WEBHOOK_ACTION = 'vobiz-webhook';

function cleanText(value: unknown, maxLength = 160): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function normalizeIndianLeadPhone(value: unknown): string {
  const raw = cleanText(value, 32);
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  const withCountry = digits.startsWith('91') ? digits : `91${digits}`;
  return `+${withCountry}`;
}

function normalizeConfiguredE164(value: unknown): string {
  const raw = cleanText(value, 32);
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  return digits ? `+${digits}` : '';
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

function joinParts(parts: string[]): string {
  return parts.filter(Boolean).join(', ');
}

function buildClinicLocation(area: string, city: string): string {
  return joinParts([area, city]) || 'your city';
}

function buildClinicContextLine(clinicName: string, area: string, city: string): string {
  const location = buildClinicLocation(area, city);
  const name = clinicName || 'aapka clinic';
  return `${name} ${location} mein patients serve karta hai`;
}

function buildClinicProofLine(rating: string, reviewCount: string, categories: string): string {
  const category = categories ? `Category: ${categories}. ` : '';
  if (rating && reviewCount) {
    return `${category}Online profile par ${rating} rating aur ${reviewCount} reviews dikh rahe hain`;
  }
  if (rating) {
    return `${category}Online profile par ${rating} rating dikh rahi hai`;
  }
  if (reviewCount) {
    return `${category}Online profile par ${reviewCount} patient reviews dikh rahe hain`;
  }
  return `${category}Patients clinic details online check karke appointment decide karte hain`;
}

function buildLeadPriorityLine(rating: string, reviewCount: string): string {
  const reviews = Number(reviewCount);
  const stars = Number(rating);

  if (reviews >= 100 || stars >= 4.5) {
    return 'Aapke clinic ki online trust strong hai, isliye booking flow aur follow-up system aur important ho jata hai';
  }

  if (reviews > 0 || stars > 0) {
    return 'Aapki online presence already visible hai, ab patient enquiry ko appointment mein convert karna important hai';
  }

  return 'Aapke clinic ke liye clear website aur simple booking flow online trust build karne mein help karega';
}

function isAuthorizedVobizWebhook(req: VercelRequest): boolean {
  const secret = process.env['VOBIZ_WEBHOOK_SECRET']?.trim();
  if (!secret) return true;

  const headerValue = req.headers['x-vobiz-webhook-secret'] ?? req.headers['x-webhook-secret'];
  const provided = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  return provided === secret;
}

function handleVobizWebhook(req: VercelRequest, res: VercelResponse): VercelResponse {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAuthorizedVobizWebhook(req)) {
    return res.status(401).json({ error: 'Unauthorized webhook.' });
  }

  const event = (req.body ?? {}) as Record<string, unknown>;
  const callSid = cleanText(event['call_sid'] ?? event['callSid'] ?? event['sid'], 120);
  const status = cleanText(event['status'] ?? event['call_status'] ?? event['callStatus'], 80);
  const duration = typeof event['duration'] === 'number' ? event['duration'] : event['call_duration'];

  console.warn('[vobiz-webhook] call event', {
    callSid: callSid || 'unknown',
    status: status || 'unknown',
    duration: typeof duration === 'string' || typeof duration === 'number' ? duration : undefined,
  });

  return res.status(200).json({ ok: true });
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<VercelResponse> {
  if (req.query['action'] === VOBIZ_WEBHOOK_ACTION) {
    return handleVobizWebhook(req, res);
  }

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

  const apiKey = process.env['RETELL_API_KEY']?.trim();
  const fromNumber = normalizeConfiguredE164(process.env['RETELL_FROM_NUMBER']);
  const overrideAgentId = process.env['RETELL_AGENT_ID']?.trim() ?? MYDENTAL_RETELL_AGENT_ID;

  if (!apiKey || !fromNumber) {
    return res.status(500).json({
      error: 'Retell AI is not configured. Set RETELL_API_KEY and RETELL_FROM_NUMBER in Vercel environment variables.',
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
  const toNumber = normalizeIndianLeadPhone(lead['phone']);
  if (!toNumber) {
    return res.status(400).json({ error: 'Lead phone number is missing or invalid.' });
  }

  const clinicName = cleanText(lead['clinicName']);
  const doctorName = cleanText(lead['doctorName']);
  const city = cleanText(lead['city']);
  const area = cleanText(lead['area']);
  const categories = cleanText(lead['categories']);
  const rating = typeof lead['rating'] === 'number' ? String(lead['rating']) : '';
  const reviewCount = typeof lead['reviewCount'] === 'number' ? String(lead['reviewCount']) : '';
  const source = cleanText(lead['source'], 40);
  const currentStatus = cleanText(lead['status'], 40);
  const followUpDate = addDaysIso(1);
  const appBaseUrl = process.env['APP_BASE_URL']?.trim();
  const clinicLocation = buildClinicLocation(area, city);
  const clinicContextLine = buildClinicContextLine(clinicName, area, city);
  const clinicProofLine = buildClinicProofLine(rating, reviewCount, categories);
  const leadPriorityLine = buildLeadPriorityLine(rating, reviewCount);

  const payload: Record<string, unknown> = {
    from_number: fromNumber,
    to_number: toNumber,
    metadata: {
      lead_id: leadId,
      source: 'mydentalplatform_leads',
    },
    retell_llm_dynamic_variables: {
      timezone: 'Asia/Kolkata',
      lead_id: leadId,
      clinic_name: clinicName || 'the clinic',
      doctor_name: doctorName || 'Doctor',
      city,
      area,
      clinic_location: clinicLocation,
      categories,
      rating,
      review_count: reviewCount,
      lead_source: source || 'manual',
      current_status: currentStatus || 'new',
      agent_name: 'Amritanshu',
      clinic_context_line: clinicContextLine,
      clinic_proof_line: clinicProofLine,
      lead_priority_line: leadPriorityLine,
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

  payload['override_agent_id'] = overrideAgentId;

  try {
    const retellRes = await fetch('https://api.retellai.com/v2/create-phone-call', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseText = await retellRes.text();
    let retellBody: Record<string, unknown> = {};
    try {
      retellBody = responseText ? JSON.parse(responseText) as Record<string, unknown> : {};
    } catch {
      retellBody = { raw: responseText };
    }

    if (!retellRes.ok) {
      console.error('[retell-call] Retell API failed:', retellRes.status, retellBody);
      return res.status(502).json({
        error: 'Retell AI could not queue the call.',
        details: retellBody,
      });
    }

    const callId = cleanText(retellBody['call_id'], 120);
    const retellStatus = cleanText(retellBody['call_status'], 80) || 'registered';
    const nextLeadStatus = currentStatus === 'new' || !currentStatus ? 'contacted' : currentStatus;

    await leadRef.update({
      status: nextLeadStatus,
      followUpDate,
    });

    await leadRef.collection('activities').add({
      type: 'called',
      note: `Retell AI call ${retellStatus}${callId ? ` - call ${callId}` : ''}`,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: uid,
    });

    return res.status(200).json({
      ok: true,
      status: retellStatus,
      callId,
      leadStatus: nextLeadStatus,
      followUpDate,
    });
  } catch (error) {
    console.error('[retell-call] failed:', error);
    const message = error instanceof Error ? error.message : 'Failed to start Retell AI call.';
    return res.status(500).json({ error: message });
  }
}
