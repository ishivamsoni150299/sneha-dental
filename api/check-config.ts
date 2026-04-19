import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse): VercelResponse {
  const checks = {
    RAZORPAY_KEY_ID:        !!process.env['RAZORPAY_KEY_ID']?.trim(),
    RAZORPAY_KEY_SECRET:    !!process.env['RAZORPAY_KEY_SECRET']?.trim(),
    RAZORPAY_PLAN_STARTER:  !!process.env['RAZORPAY_PLAN_STARTER']?.trim(),
    RAZORPAY_PLAN_PRO:      !!process.env['RAZORPAY_PLAN_PRO']?.trim(),
    ELEVENLABS_API_KEY:     !!process.env['ELEVENLABS_API_KEY']?.trim(),
    APP_BASE_URL:           !!process.env['APP_BASE_URL']?.trim(),
    FIREBASE_PROJECT_ID:    !!process.env['FIREBASE_PROJECT_ID']?.trim(),
    FIREBASE_CLIENT_EMAIL:  !!process.env['FIREBASE_CLIENT_EMAIL']?.trim(),
    FIREBASE_PRIVATE_KEY:   !!process.env['FIREBASE_PRIVATE_KEY']?.trim(),
  };
  const optionalChecks = {
    ANTHROPIC_API_KEY: !!process.env['ANTHROPIC_API_KEY']?.trim(),
  };

  const missing = Object.entries(checks).filter(([, value]) => !value).map(([key]) => key);
  const ok = missing.length === 0;

  const keyPrefixes: Record<string, string> = {};
  for (const key of ['RAZORPAY_KEY_ID', 'RAZORPAY_PLAN_STARTER', 'RAZORPAY_PLAN_PRO', 'ELEVENLABS_API_KEY', 'ANTHROPIC_API_KEY']) {
    const value = process.env[key]?.trim() ?? '';
    keyPrefixes[key] = value ? `${value.slice(0, 8)}...` : '(not set)';
  }

  return res.status(ok ? 200 : 500).json({ ok, checks, optionalChecks, missing, keyPrefixes });
}
