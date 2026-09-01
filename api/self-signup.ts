import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'crypto';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getAppCheck } from 'firebase-admin/app-check';
import { sendEmail } from '../lib/server/send-email';
import { PLATFORM_PLANS } from '../src/app/core/config/platform-entitlements';
import {
  createRazorpayCheckout,
  type BillingCycle,
  type BillingPlan,
} from './_lib/razorpay-billing';

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
const auth = getAuth();
const appCheck = getAppCheck();

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW = 60_000;

async function isRateLimited(ip: string): Promise<boolean> {
  const bucket = Math.floor(Date.now() / RATE_LIMIT_WINDOW);
  const fingerprint = createHash('sha256').update(`${ip}:${bucket}`).digest('hex');
  const ref = db.collection('rateLimits').doc(`signup_${fingerprint}`);

  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const count = Number(snap.data()?.['count'] ?? 0);
    if (count >= RATE_LIMIT_MAX) return true;

    tx.set(ref, {
      type: 'signup',
      count: count + 1,
      expiresAt: new Date((bucket + 2) * RATE_LIMIT_WINDOW),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return false;
  });
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 30);
}

async function uniqueSlug(base: string): Promise<string> {
  let candidate = base;
  let i = 2;

  while (true) {
    const existing = await db.collection('clinics')
      .where('vercelDomain', '==', `${candidate}.mydentalplatform.com`)
      .limit(1)
      .get();

    if (existing.empty) return candidate;
    candidate = `${base}${i}`;
    i++;
    if (i > 99) return `${base}${Date.now()}`;
  }
}

export interface SelfSignupResponse {
  clinicId: string;
  slug: string;
  siteUrl: string;
  adminUrl: string;
  email: string;
  plan: 'trial' | 'starter' | 'pro';
  billingCycle: BillingCycle;
  subscriptionId: string | null;
  paymentUrl: string | null;
  manualPaymentUrl: string | null;
  paymentMode: 'subscription' | 'manual' | null;
  trialEndDate: string | null;
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const appCheckHeader = req.headers['x-firebase-appcheck'];
  const appCheckToken = Array.isArray(appCheckHeader) ? appCheckHeader[0] : appCheckHeader;
  const appCheckEnforced = process.env['FIREBASE_APP_CHECK_ENFORCED'] === 'true';
  if (appCheckToken) {
    try {
      await appCheck.verifyToken(appCheckToken);
    } catch {
      return res.status(401).json({ error: 'Application verification failed. Refresh and try again.' });
    }
  } else if (appCheckEnforced) {
    return res.status(401).json({ error: 'Application verification is required. Refresh and try again.' });
  }

  const ip = (
    req.headers['x-forwarded-for'] as string | undefined
  )?.split(',')[0]?.trim() ?? req.socket?.remoteAddress ?? 'unknown';

  if (await isRateLimited(ip)) {
    return res.status(429).json({
      error: 'Too many signup attempts. Please wait a minute and try again.',
    });
  }

  const {
    name,
    doctorName,
    doctorQualification,
    city,
    addressLine1,
    addressLine2,
    phone,
    phoneE164,
    whatsappNumber,
    hours = [],
    services = [],
    idToken,
    plan = 'trial',
    billingCycle = 'monthly',
    theme = 'blue',
    slug: preferredSlug,
    marketing,
  } = req.body ?? {};

  if (!idToken) {
    return res.status(401).json({ error: 'Authentication required. Please sign in first.' });
  }
  if (!name || !phone) {
    return res.status(400).json({ error: 'name and phone are required.' });
  }
  if (!['trial', 'starter', 'pro'].includes(plan)) {
    return res.status(400).json({ error: 'Invalid plan.' });
  }
  if (!['monthly', 'yearly'].includes(billingCycle)) {
    return res.status(400).json({ error: 'Invalid billing cycle.' });
  }
  if (plan !== 'trial' && billingCycle !== 'monthly') {
    return res.status(400).json({ error: 'Yearly billing is temporarily disabled. Please choose monthly.' });
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

  let uid: string;
  let email: string;
  let claimedClinicId = '';
  try {
    const decoded = await auth.verifyIdToken(idToken);
    uid = decoded.uid;
    email = decoded.email ?? '';
    claimedClinicId = typeof decoded['clinicId'] === 'string' ? decoded['clinicId'] : '';
    if (decoded.email_verified !== true) {
      return res.status(403).json({ error: 'Verify your email before creating a clinic workspace.' });
    }
  } catch (err) {
    console.error('[self-signup] Token verification failed:', err);
    return res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' });
  }

  const existing = claimedClinicId
    ? await db.collection('clinics').doc(claimedClinicId).get()
    : await db.collection('clinics').where('adminUid', '==', uid).limit(1).get();
  if (('exists' in existing && existing.exists) || ('empty' in existing && !existing.empty)) {
    return res.status(409).json({ error: 'You already have a clinic. Please sign in to your admin panel.' });
  }

  const baseSlug = preferredSlug ? toSlug(preferredSlug) : toSlug(name);
  if (!baseSlug) {
    return res.status(400).json({ error: 'Clinic name too short to generate a subdomain.' });
  }

  const slug = await uniqueSlug(baseSlug);
  const domain = `${slug}.mydentalplatform.com`;
  const siteUrl = `https://${domain}`;

  const totalClinics = await db.collection('clinics').count().get();
  const clinicCount = totalClinics.data().count;
  const isGrandfathered = clinicCount < 20 && plan !== 'trial';
  const grandfatherEnd = new Date();
  grandfatherEnd.setMonth(grandfatherEnd.getMonth() + 12);

  const clinicData: Record<string, unknown> = {
    name: name.trim(),
    doctorName: doctorName?.trim() ?? '',
    doctorQualification: doctorQualification?.trim() ?? 'BDS',
    doctorUniversity: '',
    doctorBio: [],
    patientCount: '0',
    phone: phone.trim(),
    phoneE164: phoneE164?.trim() ?? whatsappNumber?.trim() ?? '',
    whatsappNumber: whatsappNumber?.trim() ?? phoneE164?.trim() ?? '',
    addressLine1: addressLine1?.trim() ?? city?.trim() ?? '',
    addressLine2: addressLine2?.trim() ?? '',
    city: city?.trim() ?? '',
    mapEmbedUrl: '',
    mapDirectionsUrl: '',
    theme: ['blue', 'teal', 'emerald', 'purple', 'rose', 'caramel'].includes(theme) ? theme : 'blue',
    bookingRefPrefix: slug.slice(0, 2).toUpperCase() || 'BK',
    social: {},
    hours: Array.isArray(hours) ? hours : [],
    services: Array.isArray(services) ? services : [],
    plans: [],
    testimonials: [],
    vercelDomain: domain,
    active: true,
    subscriptionPlan: plan,
    subscriptionStatus: plan === 'trial' ? 'trial' : 'pending',
    trialEndDate: null,
    createdAt: FieldValue.serverTimestamp(),
  };

  const privateAccountData: Record<string, unknown> = {
    adminUid: uid,
    adminEmail: email,
    billingEmail: email,
    billingCycle: billingCycle as BillingCycle,
    leadSource: marketingAttribution.source,
    marketingAttribution,
    voiceBudgetCap: 1000,
    voiceAutoStop: true,
    ...(isGrandfathered ? {
      grandfatheredUntil: grandfatherEnd.toISOString().slice(0, 10),
      grandfatheredPlan: plan as 'starter' | 'pro',
    } : {}),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  let clinicId: string;
  try {
    const ref = db.collection('clinics').doc();
    const batch = db.batch();
    batch.set(ref, { ...clinicData, clinicId: ref.id });
    batch.set(ref.collection('private').doc('account'), privateAccountData);
    await batch.commit();
    clinicId = ref.id;
  } catch (err) {
    console.error('[self-signup] Firestore create clinic failed:', err);
    return res.status(500).json({ error: 'Failed to save clinic. Please try again.' });
  }

  try {
    await auth.setCustomUserClaims(uid, { clinicId, role: 'admin' });
  } catch (err) {
    console.error('[self-signup] Failed to assign clinic access claims:', err);
    try {
      const clinicRef = db.collection('clinics').doc(clinicId);
      const cleanup = db.batch();
      cleanup.delete(clinicRef.collection('private').doc('account'));
      cleanup.delete(clinicRef);
      await cleanup.commit();
    } catch (cleanupError) {
      console.error('[self-signup] Failed to roll back clinic after claims error:', cleanupError);
    }
    return res.status(500).json({ error: 'Could not secure your clinic workspace. Please try again.' });
  }

  const vercelToken = process.env['VERCEL_TOKEN'];
  const vercelProjectId = process.env['VERCEL_PROJECT_ID'];
  let vercelDomainAdded = false;

  if (vercelToken && vercelProjectId) {
    try {
      const vRes = await fetch(
        `https://api.vercel.com/v9/projects/${vercelProjectId}/domains`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${vercelToken}`,
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
    console.warn('[self-signup] VERCEL_TOKEN or VERCEL_PROJECT_ID not set - skipping domain registration');
  }

  let paymentUrl: string | null = null;
  let manualPaymentUrl: string | null = null;
  let paymentMode: 'subscription' | 'manual' | null = null;
  let subscriptionId: string | null = null;

  if (plan !== 'trial') {
    try {
      const checkout = await createRazorpayCheckout({
        clinicId,
        clinicName: name,
        plan: plan as BillingPlan,
        billingCycle: billingCycle as BillingCycle,
        phone,
      });

      subscriptionId = checkout.subscriptionId;
      paymentUrl = checkout.paymentUrl;
      manualPaymentUrl = checkout.manualPaymentUrl;
      paymentMode = checkout.paymentMode;

      if (checkout.subscriptionId) {
        await db.collection('clinics').doc(clinicId).collection('private').doc('account').set({
          pendingRazorpaySubscriptionId: checkout.subscriptionId,
          pendingPlan: plan,
          pendingBillingCycle: billingCycle,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true }).catch(() => null);
      }
    } catch (err) {
      console.error('[self-signup] Razorpay checkout creation failed:', err);
    }
  }

  void sendEmail('welcome', email, {
    clinicName: name.trim(),
    doctorName: doctorName?.trim() ?? '',
    siteUrl,
    adminUrl: 'https://www.mydentalplatform.com/business/login',
    email,
    planLabel: PLATFORM_PLANS[plan as 'trial' | 'starter' | 'pro'].label,
    supportPhone: process.env['SUPPORT_PHONE'] ?? '',
  }).catch(() => undefined);

  return res.status(200).json({
    clinicId,
    slug,
    siteUrl,
    adminUrl: 'https://www.mydentalplatform.com/business/login',
    email,
    plan,
    billingCycle: billingCycle as BillingCycle,
    subscriptionId,
    paymentUrl,
    manualPaymentUrl,
    paymentMode,
    trialEndDate: null,
    domainRegistered: vercelDomainAdded,
  } satisfies SelfSignupResponse);
}
