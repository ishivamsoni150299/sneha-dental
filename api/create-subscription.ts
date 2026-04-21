import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  createRazorpayCheckout,
  type BillingCycle,
  type BillingPlan,
} from './_lib/razorpay-billing';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const {
    clinicId,
    plan,
    billingCycle = 'monthly',
    clinicName,
    phone,
  } = req.body ?? {};

  if (!clinicId || (plan !== 'starter' && plan !== 'pro')) {
    return res.status(400).json({ error: 'Missing or invalid clinicId / plan.' });
  }

  if (billingCycle !== 'monthly' && billingCycle !== 'yearly') {
    return res.status(400).json({ error: 'Invalid billing cycle.' });
  }

  try {
    const checkout = await createRazorpayCheckout({
      clinicId,
      clinicName: clinicName ?? clinicId,
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
    const rzpErr = err as Record<string, unknown>;
    const detail = (rzpErr['error'] as Record<string, unknown>)?.['description']
      ?? (rzpErr['message'] as string)
      ?? JSON.stringify(err);
    console.error('[create-subscription] Razorpay error:', detail, err);
    return res.status(500).json({ error: `Razorpay: ${detail}` });
  }
}
