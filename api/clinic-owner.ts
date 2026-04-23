import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth, type UserRecord } from 'firebase-admin/auth';

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
const auth = getAuth();

function cleanEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function cleanPassword(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanText(value: unknown, maxLength = 120): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function isUserNotFound(error: unknown): boolean {
  return (error as { code?: string }).code === 'auth/user-not-found';
}

async function assertSuperAdmin(idToken: unknown): Promise<void> {
  if (typeof idToken !== 'string' || !idToken.trim()) {
    throw new Error('Authentication required.');
  }

  const decoded = await auth.verifyIdToken(idToken);
  const admin = await db.collection('superAdmins').doc(decoded.uid).get();
  if (!admin.exists) {
    throw new Error('Super admin access required.');
  }
}

async function getOrCreateOwner(email: string, password: string, clinicName: string): Promise<UserRecord> {
  try {
    const existing = await auth.getUserByEmail(email);
    if (password) {
      return await auth.updateUser(existing.uid, {
        password,
        displayName: clinicName || existing.displayName,
      });
    }
    return existing;
  } catch (error) {
    if (!isUserNotFound(error)) throw error;
    if (!password) {
      throw new Error('Password is required when creating a new clinic owner login.', { cause: error });
    }

    return auth.createUser({
      email,
      password,
      displayName: clinicName || undefined,
      emailVerified: false,
      disabled: false,
    });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<VercelResponse> {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const clinicId = cleanText(body['clinicId'], 80);
  const clinicName = cleanText(body['clinicName']);
  const email = cleanEmail(body['email']);
  const password = cleanPassword(body['password']);

  if (!clinicId) {
    return res.status(400).json({ error: 'Clinic ID is required.' });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid owner login email is required.' });
  }
  if (password && password.length < 8) {
    return res.status(400).json({ error: 'Temporary password must be at least 8 characters.' });
  }

  try {
    await assertSuperAdmin(body['idToken']);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unauthorized.';
    return res.status(401).json({ error: message });
  }

  const clinicRef = db.collection('clinics').doc(clinicId);
  const clinicSnap = await clinicRef.get();
  if (!clinicSnap.exists) {
    return res.status(404).json({ error: 'Clinic not found.' });
  }

  try {
    const owner = await getOrCreateOwner(email, password, clinicName);

    const targetIsSuperAdmin = await db.collection('superAdmins').doc(owner.uid).get();
    if (targetIsSuperAdmin.exists) {
      return res.status(400).json({
        error: 'Use a separate clinic-owner email. Super admin accounts cannot be assigned to a clinic.',
      });
    }

    const linkedClinic = await db.collection('clinics')
      .where('adminUid', '==', owner.uid)
      .limit(1)
      .get();

    if (!linkedClinic.empty && linkedClinic.docs[0].id !== clinicId) {
      return res.status(409).json({
        error: 'This owner email is already linked to another clinic.',
      });
    }

    const existingBillingEmail = cleanEmail(clinicSnap.data()?.['billingEmail']);
    await clinicRef.update({
      adminUid: owner.uid,
      adminEmail: email,
      ...(!existingBillingEmail ? { billingEmail: email } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await auth.setCustomUserClaims(owner.uid, {
      ...(owner.customClaims ?? {}),
      clinicId,
      role: 'admin',
    });

    return res.status(200).json({
      ok: true,
      uid: owner.uid,
      email,
      passwordChanged: !!password,
    });
  } catch (error) {
    console.error('[clinic-owner] failed:', error);
    const message = error instanceof Error ? error.message : 'Failed to create clinic owner login.';
    return res.status(500).json({ error: message });
  }
}
