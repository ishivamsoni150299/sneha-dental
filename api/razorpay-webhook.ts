import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// ── Env vars to set in Vercel dashboard ──────────────────────────────────────
// RAZORPAY_WEBHOOK_SECRET → set this in Razorpay → Settings → Webhooks
// FIREBASE_PROJECT_ID     → sneha-dental-6373b
// FIREBASE_CLIENT_EMAIL   → from Firebase service account JSON
// FIREBASE_PRIVATE_KEY    → from Firebase service account JSON (paste as-is with \n)
//
// To get Firebase service account:
//   Firebase Console → Project Settings → Service accounts → Generate new private key

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  // ── Verify Razorpay signature ─────────────────────────────────────────────
  const signature = req.headers['x-razorpay-signature'] as string;
  const secret    = process.env['RAZORPAY_WEBHOOK_SECRET'];

  if (!secret) {
    console.error('RAZORPAY_WEBHOOK_SECRET not set');
    return res.status(500).end();
  }

  const body     = JSON.stringify(req.body);
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');

  if (!signature || signature !== expected) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // ── Parse event ───────────────────────────────────────────────────────────
  const event   = req.body?.event as string;
  const entity  = req.body?.payload?.subscription?.entity ?? {};
  const subId   = entity.id        as string | undefined;
  const notes   = entity.notes     as Record<string, string> | undefined;
  const clinicId = notes?.['clinicId'];
  const plan     = notes?.['plan'] ?? 'starter';

  if (!clinicId) {
    // Subscription not created by this platform — ignore safely
    return res.status(200).json({ ok: true });
  }

  const clinicRef = db.collection('clinics').doc(clinicId);

  try {
    switch (event) {
      // First payment + every monthly renewal
      case 'subscription.activated':
      case 'subscription.charged':
        await clinicRef.update({
          subscriptionStatus:     'active',
          subscriptionPlan:       plan,
          razorpaySubscriptionId: subId ?? FieldValue.delete(),
          active:                 true,
          lastPaymentAt:          new Date().toISOString(),
        });
        break;

      // Payment failing — give grace, don't suspend immediately
      case 'subscription.pending':
        await clinicRef.update({
          razorpaySubscriptionId: subId ?? FieldValue.delete(),
        });
        break;

      // All retries exhausted — suspend
      case 'subscription.halted':
        await clinicRef.update({
          subscriptionStatus: 'expired',
          active:             false,
        });
        break;

      // Clinic cancelled
      case 'subscription.cancelled':
        await clinicRef.update({
          subscriptionStatus: 'cancelled',
          active:             false,
        });
        break;

      // Resumed after failed payment
      case 'subscription.resumed':
        await clinicRef.update({
          subscriptionStatus: 'active',
          active:             true,
        });
        break;

      default:
        // Unhandled event — log and return 200 so Razorpay doesn't retry
        console.log(`Unhandled Razorpay event: ${event}`);
    }
  } catch (err) {
    console.error(`Failed to update clinic ${clinicId} for event ${event}:`, err);
    return res.status(500).json({ error: 'Firestore update failed' });
  }

  return res.status(200).json({ ok: true });
}
