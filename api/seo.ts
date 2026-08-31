import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  getBaseUrl,
  getRequestHostname,
  getRobotsTxt,
  getSitemapUrls,
} from '../lib/server/seo-utils';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function sendSitemap(req: VercelRequest, res: VercelResponse): VercelResponse {
  const hostname = getRequestHostname(req);
  const baseUrl = getBaseUrl(req);
  const urls = getSitemapUrls(baseUrl, hostname);

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(url => `  <url>
    <loc>${escapeXml(url)}</loc>
  </url>`).join('\n')}
</urlset>
`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=1800');

  return res.status(200).send(body);
}

function sendRobots(req: VercelRequest, res: VercelResponse): VercelResponse {
  const hostname = getRequestHostname(req);
  const baseUrl = getBaseUrl(req);
  const content = getRobotsTxt(baseUrl, hostname);

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=1800');

  return res.status(200).send(content);
}

async function sendHealth(res: VercelResponse): Promise<VercelResponse> {
  res.setHeader('Cache-Control', 'no-store');
  const requiredEnv = [
    'FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY',
    'CRON_SECRET', 'ZOHO_SMTP_USER', 'ZOHO_SMTP_PASS',
  ];
  const configurationReady = requiredEnv.every(key => Boolean(process.env[key]));
  let databaseReady = false;
  try {
    if (!getApps().length) {
      initializeApp({ credential: cert({
        projectId: process.env['FIREBASE_PROJECT_ID'],
        clientEmail: process.env['FIREBASE_CLIENT_EMAIL'],
        privateKey: process.env['FIREBASE_PRIVATE_KEY']?.replace(/\\n/g, '\n'),
      }) });
    }
    await getFirestore().collection('clinics').limit(1).get();
    databaseReady = true;
  } catch (error) {
    console.error('[health] Database check failed:', error);
  }
  const healthy = configurationReady && databaseReady;
  return res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    checks: { configuration: configurationReady, database: databaseReady },
    timestamp: new Date().toISOString(),
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<VercelResponse> {
  const type = typeof req.query['type'] === 'string' ? req.query['type'] : '';

  if (type === 'robots') {
    return sendRobots(req, res);
  }

  if (type === 'sitemap') {
    return sendSitemap(req, res);
  }

  if (type === 'health') {
    return sendHealth(res);
  }

  return res.status(400).json({ error: 'Unknown SEO type' });
}
