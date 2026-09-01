import crypto from 'crypto';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  parseBillingSubscriptionMetadata,
  razorpaySubscriptionEndDateIso,
  resolveBillingWebhookAction,
  type BillingWebhookEventKind,
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
    const subscriptionId = typeof subscriptionEntity['id'] === 'string'
      ? subscriptionEntity['id']
      : undefined;
    const metadata = parseBillingSubscriptionMetadata(subscriptionEntity['notes']);

    if (!metadata || !subscriptionId) {
      console.warn(`Ignored Razorpay event ${event || 'unknown'} with invalid subscription metadata`);
      return jsonResponse({ ok: true, ignored: true });
    }

    const { clinicId, plan, billingCycle } = metadata;
    const providerEventId = req.headers.get('x-razorpay-event-id')?.trim() ?? '';
    const eventKey = crypto.createHash('sha256')
      .update(providerEventId || rawBody)
      .digest('hex');

    const clinicRef = db.collection('clinics').doc(clinicId);
    const privateRef = clinicRef.collection('private').doc('account');
    const eventRef = db.collection('billingWebhookEvents').doc(eventKey);
    const todayIso = new Date().toISOString().slice(0, 10);
    const publicUpdateBase = {
      subscriptionPlan: plan,
    };
    const privateUpdateBase = { billingCycle };

    const applyBillingUpdate = async (
      publicUpdate: Record<string, unknown>,
      privateUpdate: Record<string, unknown> = {},
      eventKind: BillingWebhookEventKind,
    ): Promise<void> => {
      await db.runTransaction(async transaction => {
        const [processedEvent, privateAccount] = await Promise.all([
          transaction.get(eventRef),
          transaction.get(privateRef),
        ]);
        if (processedEvent.exists) return;

        const privateData = privateAccount.data() ?? {};
        const webhookAction = resolveBillingWebhookAction(
          privateData['razorpaySubscriptionId'],
          privateData['pendingRazorpaySubscriptionId'],
          subscriptionId,
          eventKind,
        );
        if (webhookAction === 'ignore-stale' || webhookAction === 'keep-current') {
          transaction.set(eventRef, {
            clinicId,
            event,
            providerEventId: providerEventId || null,
            ignoredReason: webhookAction === 'ignore-stale'
              ? 'superseded_subscription'
              : 'pending_upgrade_keeps_current_plan',
            processedAt: FieldValue.serverTimestamp(),
          });
          return;
        }
        if (webhookAction === 'clear-pending') {
          transaction.set(privateRef, {
            pendingRazorpaySubscriptionId: FieldValue.delete(),
            pendingPlan: FieldValue.delete(),
            pendingBillingCycle: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
          transaction.set(eventRef, {
            clinicId,
            event,
            providerEventId: providerEventId || null,
            ignoredReason: 'pending_subscription_closed',
            processedAt: FieldValue.serverTimestamp(),
          });
          return;
        }

        const activatesPendingSubscription =
          privateData['pendingRazorpaySubscriptionId'] === subscriptionId && eventKind === 'activate';

        transaction.update(clinicRef, { ...publicUpdateBase, ...publicUpdate });
        transaction.set(privateRef, {
          ...privateUpdateBase,
          ...privateUpdate,
          ...(eventKind === 'activate' ? { razorpaySubscriptionId: subscriptionId } : {}),
          ...(activatesPendingSubscription ? {
            pendingRazorpaySubscriptionId: FieldValue.delete(),
            pendingPlan: FieldValue.delete(),
            pendingBillingCycle: FieldValue.delete(),
          } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        transaction.set(eventRef, {
          clinicId,
          event,
          providerEventId: providerEventId || null,
          processedAt: FieldValue.serverTimestamp(),
        });
      });
    };

    try {
      switch (event) {
        case 'subscription.authenticated':
        case 'subscription.pending':
          await applyBillingUpdate({
            subscriptionStatus: 'pending',
          }, {}, 'pending');
          break;

        case 'subscription.activated':
        case 'subscription.charged':
          await applyBillingUpdate({
            subscriptionStatus: 'active',
            active: true,
            subscriptionEndDate: razorpaySubscriptionEndDateIso(
              subscriptionEntity['current_end'],
              billingCycle,
            ),
          }, {
            lastPaymentDate: todayIso,
            lastPaymentAmount: typeof paymentEntity['amount'] === 'number'
              ? Math.round(paymentEntity['amount'] / 100)
              : FieldValue.delete(),
            lastPaymentRef: typeof paymentEntity['id'] === 'string'
              ? paymentEntity['id']
              : FieldValue.delete(),
          }, 'activate');
          break;

        case 'subscription.halted':
          await applyBillingUpdate({
            subscriptionStatus: 'expired',
            active: false,
          }, {}, 'terminate');
          break;

        case 'subscription.cancelled':
          await applyBillingUpdate({
            subscriptionStatus: 'cancelled',
            active: false,
          }, {}, 'terminate');
          break;

        case 'subscription.resumed':
          await applyBillingUpdate({
            subscriptionStatus: 'active',
            active: true,
            subscriptionEndDate: razorpaySubscriptionEndDateIso(
              subscriptionEntity['current_end'],
              billingCycle,
            ),
          }, {}, 'activate');
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
