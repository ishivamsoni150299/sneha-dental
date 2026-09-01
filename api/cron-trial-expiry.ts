/**
 * GET /api/cron-trial-expiry
 *
 * Vercel Cron Job — runs every 15 minutes.
 * Expires overdue marketplace appointment requests, releases their reserved
 * slots, sends queued patient notices, and cleans expired rate-limit records.
 *
 * Schedule is declared in vercel.json:
 *   The Vercel schedule runs this endpoint every fifteen minutes.
 *
 * Required env vars:
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 *   CRON_SECRET   → set in Vercel dashboard; Vercel sends it as Authorization header
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { FieldValue, getFirestore, type DocumentData } from 'firebase-admin/firestore';
import { sendEmail } from '../lib/server/send-email';
import {
  buildAppointmentSlotId,
  isOverdueMarketplaceRequest,
} from './_lib/marketplace-appointment-policy';

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
const MARKETPLACE_EXPIRY_BATCH_SIZE = 40;

interface ExpiredMarketplaceRequest {
  appointmentId: string;
  clinicId: string;
  patientName: string;
  patientEmail: string;
  bookingRef: string;
  service: string;
  date: string;
  time: string;
  notificationId: string;
}

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

async function expireOverdueMarketplaceRequests(now: Date): Promise<ExpiredMarketplaceRequest[]> {
  const snapshot = await db.collection('appointments')
    .where('source', '==', 'marketplace')
    .where('status', '==', 'pending')
    .where('confirmationDeadline', '<=', now)
    .limit(MARKETPLACE_EXPIRY_BATCH_SIZE)
    .get();

  const expired: ExpiredMarketplaceRequest[] = [];
  for (const document of snapshot.docs) {
    const result = await db.runTransaction(async transaction => {
      const current = await transaction.get(document.ref);
      const appointment = current.data();
      if (!appointment || !isOverdueMarketplaceRequest(appointment, now)) {
        return null;
      }

      const reservationRef = db.collection('slots').doc(buildAppointmentSlotId(appointment));
      const reservation = await transaction.get(reservationRef);
      if (reservation.exists && reservation.data()?.['appointmentId'] === document.id) {
        transaction.delete(reservationRef);
      }

      const notificationId = `appointment_${document.id}_expired`;
      transaction.update(document.ref, {
        status: 'expired',
        cancellationActor: 'system',
        cancellationReason: 'Clinic did not respond within the confirmation window.',
        confirmationSlaMissed: true,
        expiredAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(db.collection('notifications').doc(notificationId), {
        type: 'appointment_request_expired',
        status: 'queued',
        clinicId: clean(appointment['clinicId'], 128),
        appointmentId: document.id,
        recipientEmail: clean(appointment['email'], 254),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      return {
        appointmentId: document.id,
        clinicId: clean(appointment['clinicId'], 128),
        patientName: clean(appointment['name'], 120) || 'Patient',
        patientEmail: clean(appointment['email'], 254),
        bookingRef: clean(appointment['bookingRef'], 32),
        service: clean(appointment['service'], 160),
        date: clean(appointment['date'], 20),
        time: clean(appointment['time'], 30),
        notificationId,
      } satisfies ExpiredMarketplaceRequest;
    });
    if (result) expired.push(result);
  }
  return expired;
}

async function deliverExpiryNotifications(requests: ExpiredMarketplaceRequest[]): Promise<number> {
  let sent = 0;
  const clinicCache = new Map<string, DocumentData>();

  for (const request of requests) {
    const notificationRef = db.collection('notifications').doc(request.notificationId);
    if (!request.patientEmail) {
      await notificationRef.set({ status: 'skipped', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      continue;
    }

    try {
      let clinic = clinicCache.get(request.clinicId);
      if (!clinic) {
        clinic = (await db.collection('clinics').doc(request.clinicId).get()).data() ?? {};
        clinicCache.set(request.clinicId, clinic);
      }
      await sendEmail('appointment_request_expired', request.patientEmail, {
        clinicName: clean(clinic['name'], 120) || 'Dental clinic',
        patientName: request.patientName,
        bookingRef: request.bookingRef,
        service: request.service,
        date: request.date,
        time: request.time,
        phone: clean(clinic['phone'], 24),
      });
      await notificationRef.set({ status: 'sent', sentAt: FieldValue.serverTimestamp() }, { merge: true });
      sent++;
    } catch (error) {
      console.error(`[cron-trial-expiry] Expiry notice failed for ${request.appointmentId}:`, error);
      await notificationRef.set({ status: 'failed', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
  }
  return sent;
}

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
  let marketplaceRequestsExpired = 0;
  let expiryNotificationsSent = 0;

  try {
    const expiredRequests = await expireOverdueMarketplaceRequests(new Date());
    marketplaceRequestsExpired = expiredRequests.length;
    expiryNotificationsSent = await deliverExpiryNotifications(expiredRequests);
  } catch (error) {
    errors.push('Marketplace request expiry failed');
    console.error('[cron-trial-expiry] Marketplace expiry failed:', error);
  }

  try {
    expiredRateLimitsDeleted = await cleanupExpiredRateLimits();
  } catch (error) {
    errors.push('Expired rate-limit cleanup failed');
    console.error('[cron-trial-expiry] Rate-limit cleanup failed:', error);
  }

  console.info(`[cron-trial-expiry] ${todayStr} — expired requests: ${marketplaceRequestsExpired}, sent notices: ${expiryNotificationsSent}, deleted rate limits: ${expiredRateLimitsDeleted}, errors: ${errors.length}`);

  return res.status(200).json({
    date: todayStr,
    marketplaceRequestsExpired,
    expiryNotificationsSent,
    expiredRateLimitsDeleted,
    errors: errors.length > 0 ? errors : undefined,
  });
}
