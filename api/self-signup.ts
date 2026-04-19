import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import Razorpay from 'razorpay';
import { sendEmail } from '../lib/server/send-email';

// ── Firebase Admin ────────────────────────────────────────────────────────────
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId:   process.env['FIREBASE_PROJECT_ID'],
      clientEmail: process.env['FIREBASE_CLIENT_EMAIL'],
      privateKey:  process.env['FIREBASE_PRIVATE_KEY']?.replace(/\\n/g, '\n'),
    }),
  });
}

const db   = getFirestore();
const auth = getAuth();

// ── Razorpay plan IDs ─────────────────────────────────────────────────────────
const RAZORPAY_PLAN_IDS: Record<string, string | undefined> = {
  starter: process.env['RAZORPAY_PLAN_STARTER'],
  pro:     process.env['RAZORPAY_PLAN_PRO'],
};

// ── Rate limiting (in-memory, per cold-start) ─────────────────────────────────
// Limits abuse without requiring Redis. Tracks signup attempts per IP.
// Resets when the Vercel function cold-starts (typically every few minutes).
// For stricter limits add Upstash Redis later.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX    = 5;      // max signups per IP per window
const RATE_LIMIT_WINDOW = 60_000; // 1 minute window (ms)

function isRateLimited(ip: string): boolean {
  const now   = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return false;
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return true;
  return false;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert clinic name to a URL-safe slug, e.g. "Indram Dental!" → "indramdental" */
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')   // remove non-alphanumeric
    .slice(0, 30);                // max 30 chars
}

/** Find a unique slug by appending an incrementing number if needed. */
async function uniqueSlug(base: string): Promise<string> {
  let candidate = base;
  let i = 2;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await db.collection('clinics')
      .where('vercelDomain', '==', `${candidate}.mydentalplatform.com`)
      .limit(1).get();
    if (existing.empty) return candidate;
    candidate = `${base}${i}`;
    i++;
    if (i > 99) return `${base}${Date.now()}`; // fallback
  }
}

// ── Typed response ────────────────────────────────────────────────────────────
export interface SelfSignupResponse {
  clinicId:         string;
  slug:             string;
  siteUrl:          string;
  adminUrl:         string;
  email:            string;
  plan:             'trial' | 'starter' | 'pro';
  subscriptionId:   string | null;
  paymentUrl:       string | null;
  trialEndDate:     string | null;
  domainRegistered: boolean;
}

interface MarketingPayload {
  plan?: 'trial' | 'starter' | 'pro';
  source?: string;
  campaign?: string;
  offer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 120) : null;
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  // ── Rate limiting ────────────────────────────────────────────────────────
  const ip = (
    req.headers['x-forwarded-for'] as string | undefined
  )?.split(',')[0]?.trim() ?? req.socket?.remoteAddress ?? 'unknown';

  if (isRateLimited(ip)) {
    return res.status(429).json({
      error: 'Too many signup attempts. Please wait a minute and try again.',
    });
  }

  const {
    // Clinic
    name, doctorName, doctorQualification, city,
    addressLine1, addressLine2,
    phone, phoneE164, whatsappNumber,
    hours = [],
    services = [],
    // Auth — client sends a Firebase ID token (user already authenticated)
    idToken,
    // Plan
    plan = 'trial',
    // Customization
    theme = 'blue',
    // Optional
    slug: preferredSlug,
    marketing,
  } = req.body ?? {};

  // ── Basic validation ───────────────────────────────────────────────────────
  if (!idToken) {
    return res.status(401).json({ error: 'Authentication required. Please sign in first.' });
  }
  if (!name || !phone) {
    return res.status(400).json({ error: 'name and phone are required.' });
  }
  if (!['trial', 'starter', 'pro'].includes(plan)) {
    return res.status(400).json({ error: 'Invalid plan.' });
  }

  const rawMarketing = (marketing ?? {}) as MarketingPayload;
  const marketingAttribution = {
    plan,
    source: cleanText(rawMarketing.source) ?? 'direct',
    campaign: cleanText(rawMarketing.campaign) ?? 'organic-signup',
    offer: cleanText(rawMarketing.offer),
    utmSource: cleanText(rawMarketing.utmSource),
    utmMedium: cleanText(rawMarketing.utmMedium),
    utmCampaign: cleanText(rawMarketing.utmCampaign),
    utmTerm: cleanText(rawMarketing.utmTerm),
    utmContent: cleanText(rawMarketing.utmContent),
  };

  // ── Verify Firebase ID token ───────────────────────────────────────────────
  let uid: string;
  let email: string;
  try {
    const decoded = await auth.verifyIdToken(idToken);
    uid   = decoded.uid;
    email = decoded.email ?? '';
  } catch (err) {
    console.error('[self-signup] Token verification failed:', err);
    return res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' });
  }

  // Check if this user already has a clinic
  const existing = await db.collection('clinics').where('adminUid', '==', uid).limit(1).get();
  if (!existing.empty) {
    return res.status(409).json({ error: 'You already have a clinic. Please sign in to your admin panel.' });
  }

  // ── Generate unique subdomain ──────────────────────────────────────────────
  const baseSlug = preferredSlug ? toSlug(preferredSlug) : toSlug(name);
  if (!baseSlug) return res.status(400).json({ error: 'Clinic name too short to generate a subdomain.' });

  const slug    = await uniqueSlug(baseSlug);
  const domain  = `${slug}.mydentalplatform.com`;
  const siteUrl = `https://${domain}`;

  // ── Trial end date (30 days from today) ────────────────────────────────────
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 30);
  const trialEndDate = trialEnd.toISOString().slice(0, 10); // "YYYY-MM-DD"

  // ── Grandfather pricing — first 20 clinics get 12-month price lock ────────
  const totalClinics = await db.collection('clinics').count().get();
  const clinicCount  = totalClinics.data().count;
  const isGrandfathered = clinicCount < 20 && plan !== 'trial';
  const grandfatherEnd  = new Date();
  grandfatherEnd.setMonth(grandfatherEnd.getMonth() + 12);

  // ── Create Firestore clinic doc ────────────────────────────────────────────
  const clinicData: Record<string, unknown> = {
    name:                name.trim(),
    doctorName:          doctorName?.trim() ?? '',
    doctorQualification: doctorQualification?.trim() ?? 'BDS',
    doctorUniversity:    '',
    doctorBio:           [],
    patientCount:        '0',
    phone:               phone.trim(),
    phoneE164:           phoneE164?.trim() ?? whatsappNumber?.trim() ?? '',
    whatsappNumber:      whatsappNumber?.trim() ?? phoneE164?.trim() ?? '',
    addressLine1:        addressLine1?.trim() ?? city?.trim() ?? '',
    addressLine2:        addressLine2?.trim() ?? '',
    city:                city?.trim() ?? '',
    mapEmbedUrl:         '',
    mapDirectionsUrl:    '',
    theme:               ['blue','teal','emerald','purple','rose','caramel'].includes(theme) ? theme : 'blue',
    bookingRefPrefix:    slug.slice(0, 2).toUpperCase() || 'BK',
    social:              {},
    hours:               Array.isArray(hours) ? hours : [],
    services:            Array.isArray(services) ? services : [],
    plans:               [],
    testimonials:        [],
    // Platform fields
    vercelDomain:        domain,
    active:              true,
    // Billing
    subscriptionPlan:    plan,
    subscriptionStatus:  plan === 'trial' ? 'trial' : 'pending',
    trialEndDate:        plan === 'trial' ? trialEndDate : null,
    billingEmail:        email,
    leadSource:          marketingAttribution.source,
    marketingAttribution,
    // Auth
    adminEmail:          email,
    adminUid:            uid,
    // Voice defaults
    voiceBudgetCap:      1000,       // ₹1,000 default overage budget
    voiceAutoStop:       true,       // auto-pause when budget exhausted
    // Grandfather pricing
    ...(isGrandfathered ? {
      grandfatheredUntil: grandfatherEnd.toISOString().slice(0, 10),
      grandfatheredPlan:  plan as 'starter' | 'pro',
    } : {}),
    // Timestamps
    createdAt:           FieldValue.serverTimestamp(),
  };

  let clinicId: string;
  try {
    const ref = await db.collection('clinics').add(clinicData);
    clinicId = ref.id;
  } catch (err) {
    console.error('[self-signup] Firestore create clinic failed:', err);
    return res.status(500).json({ error: 'Failed to save clinic. Please try again.' });
  }

  // Store clinicId in the Firestore doc itself
  await db.collection('clinics').doc(clinicId).update({ clinicId }).catch(() => null);

  // Set custom claim on the Firebase Auth user so adminGuard works on the clinic site
  await auth.setCustomUserClaims(uid, { clinicId, role: 'admin' }).catch(() => null);

  // ── Register subdomain on Vercel (Hobby-plan compatible — individual domain, not wildcard) ──
  // Requires VERCEL_TOKEN + VERCEL_PROJECT_ID env vars.
  // The wildcard CNAME *.mydentalplatform.com → cname.vercel-dns.com at Hostinger
  // already resolves the DNS — this call just tells Vercel to route it to this project.
  const vercelToken     = process.env['VERCEL_TOKEN'];
  const vercelProjectId = process.env['VERCEL_PROJECT_ID'];
  let vercelDomainAdded = false;

  if (vercelToken && vercelProjectId) {
    try {
      const vRes = await fetch(
        `https://api.vercel.com/v9/projects/${vercelProjectId}/domains`,
        {
          method:  'POST',
          headers: {
            Authorization:  `Bearer ${vercelToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: domain }),
        },
      );
      const vBody = await vRes.json() as { error?: { code?: string } };
      if (vRes.ok || vBody?.error?.code === 'domain_already_exists') {
        vercelDomainAdded = true;
      } else {
        console.warn('[self-signup] Vercel domain add returned non-OK:', vRes.status);
      }
    } catch (err) {
      console.error('[self-signup] Vercel domain registration failed (non-fatal):', err);
    }
  } else {
    console.warn('[self-signup] VERCEL_TOKEN or VERCEL_PROJECT_ID not set — skipping domain registration');
  }

  // ── Razorpay subscription for paid plans ───────────────────────────────────
  let razorpayShortUrl: string | null = null;
  let subscriptionId: string | null   = null;

  if (plan !== 'trial') {
    const planId = RAZORPAY_PLAN_IDS[plan];
    if (planId) {
      try {
        const razorpay = new Razorpay({
          key_id:     process.env['RAZORPAY_KEY_ID']!,
          key_secret: process.env['RAZORPAY_KEY_SECRET']!,
        });
        const sub = await razorpay.subscriptions.create({
          plan_id:     planId,
          total_count: 120,
          quantity:    1,
          notes:       { clinicId, clinicName: name, plan },
        });
        subscriptionId    = sub.id;
        razorpayShortUrl  = (sub as unknown as Record<string, unknown>)['short_url'] as string ?? null;
        // Store subscription info on the clinic doc
        await db.collection('clinics').doc(clinicId).update({
          razorpaySubscriptionId: sub.id,
        }).catch(() => null);
      } catch (err) {
        console.error('[self-signup] Razorpay subscription creation failed:', err);
        // Non-fatal — site is still created, admin can manually send payment link later
      }
    }
  }

  // ── Welcome email ─────────────────────────────────────────────────────────
  // Non-blocking — fire-and-forget. A failed email must never fail the signup.
  sendEmail('welcome', email, {
    clinicName:    name.trim(),
    doctorName:    doctorName?.trim() ?? '',
    siteUrl,
    adminUrl:      `${siteUrl}/admin/login`,
    email,
    plan,
    trialEndDate:  plan === 'trial' ? trialEndDate : '',
    supportPhone:  process.env['SUPPORT_PHONE'] ?? '',
  });

  // ── Success ────────────────────────────────────────────────────────────────
  return res.status(200).json({
    clinicId,
    slug,
    siteUrl,
    adminUrl:         `${siteUrl}/admin/login`,
    email,
    plan,
    subscriptionId,
    paymentUrl:       razorpayShortUrl,
    trialEndDate:     plan === 'trial' ? trialEndDate : null,
    domainRegistered: vercelDomainAdded,
  });
}
