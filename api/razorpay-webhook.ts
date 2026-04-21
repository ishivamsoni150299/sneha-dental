import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  nextBillingDateIso,
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const signature = req.headers['x-razorpay-signature'] as string;
  const secret = process.env['RAZORPAY_WEBHOOK_SECRET'];

  if (!secret) {
    console.error('RAZORPAY_WEBHOOK_SECRET not set');
    return res.status(500).end();
  }

  const body = JSON.stringify(req.body);
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');

  if (!signature || signature !== expected) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const event = req.body?.event as string;
  const subscriptionEntity = req.body?.payload?.subscription?.entity ?? {};
  const paymentEntity = req.body?.payload?.payment?.entity ?? {};
  const subscriptionId = subscriptionEntity.id as string | undefined;
  const notes = subscriptionEntity.notes as Record<string, string> | undefined;
  const clinicId = notes?.['clinicId'];
  const plan = (notes?.['plan'] ?? 'starter') as BillingPlan;
  const billingCycle = (notes?.['billingCycle'] ?? 'monthly') as BillingCycle;

  if (!clinicId) {
    return res.status(200).json({ ok: true });
  }

  const clinicRef = db.collection('clinics').doc(clinicId);
  const todayIso = new Date().toISOString().slice(0, 10);
  const updateBase = {
    subscriptionPlan: plan,
    billingCycle,
    razorpaySubscriptionId: subscriptionId ?? FieldValue.delete(),
  };

  try {
    switch (event) {
      case 'subscription.authenticated':
      case 'subscription.pending':
        await clinicRef.update({
          ...updateBase,
          subscriptionStatus: 'pending',
        });
        break;

      case 'subscription.activated':
      case 'subscription.charged':
        await clinicRef.update({
          ...updateBase,
          subscriptionStatus: 'active',
          active: true,
          lastPaymentDate: todayIso,
          lastPaymentAmount: typeof paymentEntity.amount === 'number'
            ? Math.round(paymentEntity.amount / 100)
            : FieldValue.delete(),
          lastPaymentRef: typeof paymentEntity.id === 'string'
            ? paymentEntity.id
            : FieldValue.delete(),
          subscriptionEndDate: nextBillingDateIso(billingCycle),
        });
        break;

      case 'subscription.halted':
        await clinicRef.update({
          ...updateBase,
          subscriptionStatus: 'expired',
          active: false,
        });
        break;

      case 'subscription.cancelled':
        await clinicRef.update({
          ...updateBase,
          subscriptionStatus: 'cancelled',
          active: false,
        });
        break;

      case 'subscription.resumed':
        await clinicRef.update({
          ...updateBase,
          subscriptionStatus: 'active',
          active: true,
        });
        break;

      default:
        console.log(`Unhandled Razorpay event: ${event}`);
    }
  } catch (err) {
    console.error(`Failed to update clinic ${clinicId} for event ${event}:`, err);
    return res.status(500).json({ error: 'Firestore update failed' });
  }

  return res.status(200).json({ ok: true });
}
