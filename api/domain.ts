import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

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

function normalizeHostedDomain(value: unknown): string {
  if (typeof value !== 'string') return '';

  return value.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
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

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<VercelResponse> {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const domain = normalizeHostedDomain(body['domain']);

  if (!domain.endsWith('.mydentalplatform.com') || domain === 'mydentalplatform.com') {
    return res.status(400).json({ error: 'Only mydentalplatform.com clinic subdomains can be registered here.' });
  }

  try {
    await assertSuperAdmin(body['idToken']);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unauthorized.';
    return res.status(401).json({ error: message });
  }

  const vercelToken = process.env['VERCEL_TOKEN'];
  const vercelProjectId = process.env['VERCEL_PROJECT_ID'];
  if (!vercelToken || !vercelProjectId) {
    return res.status(500).json({ error: 'VERCEL_TOKEN or VERCEL_PROJECT_ID is not configured.' });
  }

  try {
    const response = await fetch(`https://api.vercel.com/v9/projects/${vercelProjectId}/domains`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: domain }),
    });

    const data = await response.json().catch(() => ({})) as { error?: { code?: string; message?: string } };
    const code = data.error?.code ?? '';

    if (response.ok || code === 'domain_already_exists') {
      return res.status(200).json({ ok: true, domain });
    }

    return res.status(response.status || 500).json({
      error: data.error?.message ?? 'Failed to register domain with Vercel.',
      code,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to register domain with Vercel.';
    return res.status(500).json({ error: message });
  }
}
