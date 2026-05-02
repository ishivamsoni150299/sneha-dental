import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse): VercelResponse {
  const checks = {
    RAZORPAY_KEY_ID:               !!process.env['RAZORPAY_KEY_ID']?.trim(),
    RAZORPAY_KEY_SECRET:           !!process.env['RAZORPAY_KEY_SECRET']?.trim(),
    RAZORPAY_PLAN_STARTER_MONTHLY: true,
    RAZORPAY_PLAN_PRO_MONTHLY:     true,
    ELEVENLABS_API_KEY:            !!process.env['ELEVENLABS_API_KEY']?.trim(),
    APP_BASE_URL:                  !!process.env['APP_BASE_URL']?.trim(),
    FIREBASE_PROJECT_ID:           !!process.env['FIREBASE_PROJECT_ID']?.trim(),
    FIREBASE_CLIENT_EMAIL:         !!process.env['FIREBASE_CLIENT_EMAIL']?.trim(),
    FIREBASE_PRIVATE_KEY:          !!process.env['FIREBASE_PRIVATE_KEY']?.trim(),
  };
  const optionalChecks = {
    ANTHROPIC_API_KEY:        !!process.env['ANTHROPIC_API_KEY']?.trim(),
    PUBLIC_RAZORPAY_ME_URL:   !!(process.env['PUBLIC_RAZORPAY_ME_URL']?.trim() ?? process.env['RAZORPAY_ME_URL']?.trim()),
    RAZORPAY_PLAN_STARTER_YEARLY:  !!process.env['RAZORPAY_PLAN_STARTER_YEARLY']?.trim(),
    RAZORPAY_PLAN_PRO_YEARLY:      !!process.env['RAZORPAY_PLAN_PRO_YEARLY']?.trim(),
    RAZORPAY_PLAN_STARTER:    !!process.env['RAZORPAY_PLAN_STARTER']?.trim(),
    RAZORPAY_PLAN_PRO:        !!process.env['RAZORPAY_PLAN_PRO']?.trim(),
    BOLNA_API_KEY:            !!process.env['BOLNA_API_KEY']?.trim(),
    BOLNA_AGENT_ID:           !!process.env['BOLNA_AGENT_ID']?.trim(),
    BOLNA_FROM_PHONE_NUMBER:  !!process.env['BOLNA_FROM_PHONE_NUMBER']?.trim(),
  };

  const missing = Object.entries(checks).filter(([, value]) => !value).map(([key]) => key);
  const ok = missing.length === 0;

  const keyPrefixes: Record<string, string> = {};
  for (const key of [
    'RAZORPAY_KEY_ID',
    'RAZORPAY_PLAN_STARTER_MONTHLY',
    'RAZORPAY_PLAN_PRO_MONTHLY',
    'RAZORPAY_PLAN_STARTER_YEARLY',
    'RAZORPAY_PLAN_PRO_YEARLY',
    'PUBLIC_RAZORPAY_ME_URL',
    'ELEVENLABS_API_KEY',
    'BOLNA_API_KEY',
    'BOLNA_AGENT_ID',
    'BOLNA_FROM_PHONE_NUMBER',
    'ANTHROPIC_API_KEY',
  ]) {
    const value = process.env[key]?.trim() ?? '';
    keyPrefixes[key] = value ? `${value.slice(0, 8)}...` : '(not set)';
  }

  return res.status(ok ? 200 : 500).json({ ok, checks, optionalChecks, missing, keyPrefixes });
}
