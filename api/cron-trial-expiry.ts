/**
 * GET /api/cron-trial-expiry
 *
 * Vercel Cron Job — runs every day at 8:00 AM IST (2:30 AM UTC).
 * Cleans up expired API rate-limit records. The legacy `trial` plan is now the
 * permanent Free tier, so this job no longer sends trial-expiry emails.
 *
 * Schedule is declared in vercel.json:
 *   { "crons": [{ "path": "/api/cron-trial-expiry", "schedule": "30 2 * * *" }] }
 *
 * Required env vars:
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 *   CRON_SECRET   → set in Vercel dashboard; Vercel sends it as Authorization header
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore }                   from 'firebase-admin/firestore';

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

const RATE_LIMIT_CLEANUP_BATCH_SIZE = 400;
const RATE_LIMIT_CLEANUP_MAX_BATCHES = 3;

async function cleanupExpiredRateLimits(): Promise<number> {
  let deleted = 0;

  for (let batchNumber = 0; batchNumber < RATE_LIMIT_CLEANUP_MAX_BATCHES; batchNumber++) {
    const expired = await db.collection('rateLimits')
      .where('expiresAt', '<=', new Date())
      .limit(RATE_LIMIT_CLEANUP_BATCH_SIZE)
      .get();

    if (expired.empty) break;

    const batch = db.batch();
    expired.docs.forEach(document => { batch.delete(document.ref); });
    await batch.commit();
    deleted += expired.size;

    if (expired.size < RATE_LIMIT_CLEANUP_BATCH_SIZE) break;
  }

  return deleted;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel cron sends Authorization: Bearer <CRON_SECRET>
  const cronSecret = process.env['CRON_SECRET'];
  if (!cronSecret) {
    console.error('[cron-trial-expiry] CRON_SECRET is not configured');
    return res.status(503).json({ error: 'Cron is not configured.' });
  }
  const auth = req.headers['authorization'];
  if (auth !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayStr = today.toISOString().split('T')[0]; // "YYYY-MM-DD"

  const errors: string[] = [];
  let expiredRateLimitsDeleted = 0;

  try {
    expiredRateLimitsDeleted = await cleanupExpiredRateLimits();
  } catch (error) {
    errors.push('Expired rate-limit cleanup failed');
    console.error('[cron-trial-expiry] Rate-limit cleanup failed:', error);
  }

  console.info(`[cron-trial-expiry] ${todayStr} — deleted rate limits: ${expiredRateLimitsDeleted}, errors: ${errors.length}`);

  return res.status(200).json({
    date: todayStr,
    expiredRateLimitsDeleted,
    errors: errors.length > 0 ? errors : undefined,
  });
}
