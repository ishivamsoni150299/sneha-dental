import type { VercelRequest, VercelResponse } from '@vercel/node';
import Razorpay from 'razorpay';

// ── Env vars to set in Vercel dashboard ──────────────────────────────────────
// RAZORPAY_KEY_ID      → rzp_live_xxx   (from Razorpay → Settings → API Keys)
// RAZORPAY_KEY_SECRET  → your secret
// RAZORPAY_PLAN_STARTER → plan_xxx      (create ₹499/mo plan in Razorpay dashboard)
// RAZORPAY_PLAN_PRO     → plan_xxx      (create ₹999/mo plan in Razorpay dashboard)

const PLAN_IDS: Record<string, string | undefined> = {
  starter: process.env['RAZORPAY_PLAN_STARTER'],
  pro:     process.env['RAZORPAY_PLAN_PRO'],
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { clinicId, plan, clinicName, phone } = req.body ?? {};

  if (!clinicId || !plan || !PLAN_IDS[plan]) {
    return res.status(400).json({ error: 'Missing clinicId, plan, or plan not configured.' });
  }

  const razorpay = new Razorpay({
    key_id:     process.env['RAZORPAY_KEY_ID']!,
    key_secret: process.env['RAZORPAY_KEY_SECRET']!,
  });

  try {
    const sub = await razorpay.subscriptions.create({
      plan_id:     PLAN_IDS[plan]!,
      total_count: 120,                    // 10 years — effectively perpetual
      quantity:    1,
      ...(phone ? { notify_info: { notify_phone: phone } } : {}),
      notes: { clinicId, clinicName: clinicName ?? clinicId, plan },
    });

    return res.status(200).json({
      subscriptionId: sub.id,
      shortUrl:       (sub as unknown as Record<string, unknown>)['short_url'],
    });
  } catch (err: unknown) {
    console.error('Razorpay create subscription error:', err);
    return res.status(500).json({ error: 'Failed to create subscription.' });
  }
}
