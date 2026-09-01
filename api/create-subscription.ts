import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import {
  createRazorpayCheckout,
  type BillingCycle,
  type BillingPlan,
} from './_lib/razorpay-billing';

interface CreateSubscriptionBody {
  clinicId?: unknown;
  plan?: unknown;
  billingCycle?: unknown;
}

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

function bearerToken(req: VercelRequest): string {
  const rawAuthorization: unknown = req.headers['authorization'];
  const authorization = Array.isArray(rawAuthorization)
    ? (rawAuthorization.find((value): value is string => typeof value === 'string') ?? '')
    : (typeof rawAuthorization === 'string' ? rawAuthorization : '');
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
}

async function canManageClinic(idToken: string, clinicId: string): Promise<boolean> {
  if (!idToken) return false;

  const decoded = await auth.verifyIdToken(idToken);
  if (decoded.email_verified !== true) return false;
  if (decoded['clinicId'] === clinicId && decoded['role'] === 'admin') return true;

  const [clinic, superAdmin] = await Promise.all([
    db.collection('clinics').doc(clinicId).get(),
    db.collection('superAdmins').doc(decoded.uid).get(),
  ]);

  return superAdmin.exists || clinic.data()?.['adminUid'] === decoded.uid;
}

function errorDetail(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err !== 'object' || err === null) return String(err);

  const record = err as Record<string, unknown>;
  const nested = record['error'];
  if (typeof nested === 'object' && nested !== null) {
    const description = (nested as Record<string, unknown>)['description'];
    if (typeof description === 'string') return description;
  }

  const message = record['message'];
  return typeof message === 'string' ? message : 'Unknown Razorpay error';
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<VercelResponse> {
  if (req.method !== 'POST') return res.status(405).end();

  const body = (req.body ?? {}) as CreateSubscriptionBody;
  const clinicId = typeof body.clinicId === 'string' ? body.clinicId.trim() : '';
  const plan = body.plan === 'starter' || body.plan === 'pro' ? body.plan : null;
  const billingCycle = body.billingCycle ?? 'monthly';
  if (!clinicId || !plan) {
    return res.status(400).json({ error: 'Missing or invalid clinicId / plan.' });
  }

  if (billingCycle !== 'monthly') {
    return res.status(400).json({ error: 'Yearly billing is temporarily disabled. Please use monthly billing.' });
  }

  try {
    let authorized = false;
    try {
      authorized = await canManageClinic(bearerToken(req), clinicId);
    } catch {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!authorized) {
      return res.status(403).json({ error: 'You do not have access to this clinic.' });
    }

    const clinic = await db.collection('clinics').doc(clinicId).get();
    if (!clinic.exists) {
      return res.status(404).json({ error: 'Clinic not found.' });
    }

    const clinicData = clinic.data() ?? {};
    const trustedClinicName = typeof clinicData['name'] === 'string' && clinicData['name'].trim()
      ? clinicData['name'].trim()
      : clinicId;
    const trustedPhone = typeof clinicData['phone'] === 'string' && clinicData['phone'].trim()
      ? clinicData['phone'].trim()
      : undefined;

    const checkout = await createRazorpayCheckout({
      clinicId,
      clinicName: trustedClinicName,
      plan: plan as BillingPlan,
      billingCycle: billingCycle as BillingCycle,
      phone: trustedPhone,
    });

    if (checkout.subscriptionId) {
      await clinic.ref.collection('private').doc('account').set({
        pendingRazorpaySubscriptionId: checkout.subscriptionId,
        pendingPlan: plan,
        pendingBillingCycle: billingCycle,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    return res.status(200).json({
      subscriptionId: checkout.subscriptionId,
      paymentUrl: checkout.paymentUrl,
      shortUrl: checkout.paymentUrl,
      paymentMode: checkout.paymentMode,
      manualPaymentUrl: checkout.manualPaymentUrl,
      billingCycle: checkout.billingCycle,
      amount: checkout.amount,
    });
  } catch (err: unknown) {
    const detail = errorDetail(err);
    console.error('[create-subscription] Razorpay error:', detail, err);
    return res.status(500).json({ error: 'Could not start secure checkout. Please try again.' });
  }
}
