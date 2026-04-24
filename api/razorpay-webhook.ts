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

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status });
}

function isValidSignature(signature: string | null, expected: string): boolean {
  if (!signature) return false;

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return signatureBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
}

export default {
  async fetch(req: Request): Promise<Response> {
    if (req.method !== 'POST') return new Response(null, { status: 405 });

    const signature = req.headers.get('x-razorpay-signature');
    const secret = process.env['RAZORPAY_WEBHOOK_SECRET'];

    if (!secret) {
      console.error('RAZORPAY_WEBHOOK_SECRET not set');
      return new Response(null, { status: 500 });
    }

    const rawBody = await req.text();
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    if (!isValidSignature(signature, expected)) {
      return jsonResponse({ error: 'Invalid signature' }, 400);
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return jsonResponse({ error: 'Invalid JSON payload' }, 400);
    }

    const event = payload['event'] as string;
    const typedPayload = payload as {
      payload?: {
        subscription?: { entity?: Record<string, unknown> };
        payment?: { entity?: Record<string, unknown> };
      };
    };
    const subscriptionEntity = typedPayload.payload?.subscription?.entity ?? {};
    const paymentEntity = typedPayload.payload?.payment?.entity ?? {};
    const subscriptionId = subscriptionEntity.id as string | undefined;
    const notes = subscriptionEntity.notes as Record<string, string> | undefined;
    const clinicId = notes?.['clinicId'];
    const plan = (notes?.['plan'] ?? 'starter') as BillingPlan;
    const billingCycle = (notes?.['billingCycle'] ?? 'monthly') as BillingCycle;

    if (!clinicId) {
      return jsonResponse({ ok: true });
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
          console.warn(`Unhandled Razorpay event: ${event}`);
      }
    } catch (err) {
      console.error(`Failed to update clinic ${clinicId} for event ${event}:`, err);
      return jsonResponse({ error: 'Firestore update failed' }, 500);
    }

    return jsonResponse({ ok: true });
  },
};
