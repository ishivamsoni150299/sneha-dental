/**
 * GET /api/cron-trial-expiry
 *
 * Vercel Cron Job — runs every day at 8:00 AM IST (2:30 AM UTC).
 * Sends trial-expiry warning emails at T-7, T-3, and T-0 days.
 *
 * Schedule is declared in vercel.json:
 *   { "crons": [{ "path": "/api/cron-trial-expiry", "schedule": "30 2 * * *" }] }
 *
 * Required env vars:
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 *   ZOHO_SMTP_USER, ZOHO_SMTP_PASS
 *   CRON_SECRET   → set in Vercel dashboard; Vercel sends it as Authorization header
 *   SUPPORT_PHONE → e.g. "919999999999" (used in email footer)
 *   SUPPORT_WHATSAPP → e.g. "919999999999"
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore }                   from 'firebase-admin/firestore';
import { sendEmail }                       from './send-email';

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

// Days before expiry at which we send each email
const TRIGGER_DAYS = [7, 3, 0] as const;

function templateForDays(days: 0 | 3 | 7) {
  if (days === 7) return 'trial_expiry_7d' as const;
  if (days === 3) return 'trial_expiry_3d' as const;
  return 'trial_expiry_0d' as const;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel cron sends Authorization: Bearer <CRON_SECRET>
  const cronSecret = process.env['CRON_SECRET'];
  if (cronSecret) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayStr = today.toISOString().split('T')[0]; // "YYYY-MM-DD"

  const supportWhatsapp = process.env['SUPPORT_WHATSAPP'] ?? '919999999999';
  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Process each trigger day window
  for (const daysAhead of TRIGGER_DAYS) {
    const target = new Date(today);
    target.setDate(today.getDate() + daysAhead);
    const targetStr = target.toISOString().split('T')[0];

    // Fetch clinics whose trial ends exactly `daysAhead` days from today
    const snap = await db.collection('clinics')
      .where('subscriptionStatus', '==', 'trial')
      .where('trialEndDate', '==', targetStr)
      .get();

    for (const doc of snap.docs) {
      const data = doc.data();
      const email = data['billingEmail'] || data['adminEmail'];

      if (!email) { skipped++; continue; }

      // Dedup: skip if we already sent this exact email today
      // (stored in a lightweight notifications log in Firestore)
      const notifId   = `${doc.id}_trial_${daysAhead}d_${todayStr}`;
      const notifRef  = db.collection('notifications').doc(notifId);
      const notifSnap = await notifRef.get();

      if (notifSnap.exists) { skipped++; continue; }

      try {
        await sendEmail(templateForDays(daysAhead), email, {
          clinicName:      data['name']       ?? 'Your clinic',
          doctorName:      data['doctorName'] ?? '',
          trialEndDate:    data['trialEndDate'] ?? targetStr,
          supportWhatsapp,
        });

        // Mark as sent so we never duplicate
        await notifRef.set({
          clinicId:  doc.id,
          template:  templateForDays(daysAhead),
          sentAt:    new Date().toISOString(),
          email,
        });

        sent++;
      } catch (err) {
        const msg = (err as { message?: string })?.message ?? String(err);
        errors.push(`${doc.id}: ${msg}`);
        console.error(`[cron-trial-expiry] Failed for clinic ${doc.id}:`, err);
      }
    }
  }

  console.log(`[cron-trial-expiry] ${todayStr} — sent: ${sent}, skipped: ${skipped}, errors: ${errors.length}`);

  return res.status(200).json({
    date: todayStr,
    sent,
    skipped,
    errors: errors.length > 0 ? errors : undefined,
  });
}
