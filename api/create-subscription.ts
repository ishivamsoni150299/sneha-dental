import type { VercelRequest, VercelResponse } from '@vercel/node';
import Razorpay from 'razorpay';

// ── Env vars to set in Vercel dashboard ──────────────────────────────────────
// RAZORPAY_KEY_ID       → rzp_live_xxx   (Razorpay → Settings → API Keys)
// RAZORPAY_KEY_SECRET   → your secret
// RAZORPAY_PLAN_STARTER → plan_xxx      (create ₹999/mo plan in Razorpay dashboard)
// RAZORPAY_PLAN_PRO     → plan_xxx      (create ₹2499/mo plan in Razorpay dashboard)

const PLAN_IDS: Record<string, string | undefined> = {
  starter: process.env['RAZORPAY_PLAN_STARTER']?.trim(),
  pro:     process.env['RAZORPAY_PLAN_PRO']?.trim(),
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { clinicId, plan, clinicName, phone } = req.body ?? {};

  // ── Guard: API keys present ───────────────────────────────────────────────
  if (!process.env['RAZORPAY_KEY_ID'] || !process.env['RAZORPAY_KEY_SECRET']) {
    console.error('[create-subscription] Razorpay API keys not configured in env vars');
    return res.status(500).json({ error: 'Payment not configured. Contact support.' });
  }

  // ── Guard: plan ID present ────────────────────────────────────────────────
  if (!clinicId || !plan) {
    return res.status(400).json({ error: 'Missing clinicId or plan.' });
  }
  if (!PLAN_IDS[plan]) {
    console.error(`[create-subscription] Plan ID for "${plan}" not set in env vars (RAZORPAY_PLAN_${plan.toUpperCase()})`);
    return res.status(500).json({
      error: `Payment plan not configured. Set RAZORPAY_PLAN_${plan.toUpperCase()} in Vercel env vars.`,
    });
  }

  const razorpay = new Razorpay({
    key_id:     process.env['RAZORPAY_KEY_ID']!.trim(),
    key_secret: process.env['RAZORPAY_KEY_SECRET']!.trim(),
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
    // Surface the real Razorpay error so it's visible in logs + UI
    const rzpErr = err as Record<string, unknown>;
    const detail  = (rzpErr['error'] as Record<string, unknown>)?.['description']
      ?? (rzpErr['message'] as string)
      ?? JSON.stringify(err);
    console.error('[create-subscription] Razorpay error:', detail, err);
    return res.status(500).json({ error: `Razorpay: ${detail}` });
  }
}
