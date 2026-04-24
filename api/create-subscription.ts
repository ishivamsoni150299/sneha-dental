import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  createRazorpayCheckout,
  type BillingCycle,
  type BillingPlan,
} from './_lib/razorpay-billing';

interface CreateSubscriptionBody {
  clinicId?: unknown;
  plan?: unknown;
  billingCycle?: unknown;
  clinicName?: unknown;
  phone?: unknown;
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
  const clinicName = typeof body.clinicName === 'string' && body.clinicName.trim()
    ? body.clinicName.trim()
    : clinicId;
  const phone = typeof body.phone === 'string' && body.phone.trim()
    ? body.phone.trim()
    : undefined;

  if (!clinicId || !plan) {
    return res.status(400).json({ error: 'Missing or invalid clinicId / plan.' });
  }

  if (billingCycle !== 'monthly') {
    return res.status(400).json({ error: 'Yearly billing is temporarily disabled. Please use monthly billing.' });
  }

  try {
    const checkout = await createRazorpayCheckout({
      clinicId,
      clinicName,
      plan: plan as BillingPlan,
      billingCycle: billingCycle as BillingCycle,
      phone,
    });

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
    return res.status(500).json({ error: `Razorpay: ${detail}` });
  }
}
