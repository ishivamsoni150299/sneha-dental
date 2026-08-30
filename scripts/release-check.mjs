import fs from 'node:fs';
import path from 'node:path';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const root = process.cwd();

function parseEnv(filename) {
  const target = path.join(root, filename);
  if (!fs.existsSync(target)) return {};
  return Object.fromEntries(fs.readFileSync(target, 'utf8').split(/\r?\n/).flatMap(line => {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match) return [];
    let value = match[2].trim().replace(/^['"]|['"]$/g, '');
    value = value.replace(/\\n/g, '\n');
    return [[match[1], value]];
  }));
}

const env = {
  ...parseEnv('.env.local'),
  ...parseEnv('.env.production.local'),
  ...process.env,
};

const required = [
  'FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY',
  'CRON_SECRET', 'ZOHO_SMTP_USER', 'ZOHO_SMTP_PASS',
  'OPENAI_API_KEY', 'OPENAI_VOICE_SIGNING_SECRET',
  'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET',
];
const missing = required.filter(key => !env[key]);
if (missing.length) {
  console.error(`FAIL configuration: missing ${missing.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('PASS production configuration: required keys are present');
}
if (env.OPENAI_VOICE_SIGNING_SECRET && env.OPENAI_VOICE_SIGNING_SECRET.length < 32) {
  console.error('FAIL configuration: OPENAI_VOICE_SIGNING_SECRET must be at least 32 characters');
  process.exitCode = 1;
}

if (!env.SENTRY_DSN) console.warn('WARN SENTRY_DSN is not configured; browser errors will not be reported');
if (env.FIREBASE_APP_CHECK_ENFORCED === 'true' && !env.FIREBASE_APP_CHECK_SITE_KEY) {
  console.error('FAIL App Check: enforcement is enabled but FIREBASE_APP_CHECK_SITE_KEY is missing');
  process.exitCode = 1;
} else if (!env.FIREBASE_APP_CHECK_SITE_KEY) {
  console.warn('WARN Firebase App Check is not configured; browser attestation is disabled');
}

const platformUrl = String(env.APP_BASE_URL || 'https://www.mydentalplatform.com').replace(/\/$/, '');

async function checkUrl(label, url, expected = 200, expectedHostname = '') {
  try {
    const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15_000) });
    if (response.status !== expected) {
      console.error(`FAIL ${label}: HTTP ${response.status}`);
      process.exitCode = 1;
      return null;
    }
    if (expectedHostname && new URL(response.url).hostname !== expectedHostname) {
      console.error(`FAIL ${label}: redirected to ${new URL(response.url).hostname}`);
      process.exitCode = 1;
      return null;
    }
    console.log(`PASS ${label}: HTTP ${response.status}`);
    return response;
  } catch (error) {
    console.error(`FAIL ${label}: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return null;
  }
}

const homepage = await checkUrl('platform homepage', `${platformUrl}/business`);
await checkUrl('client login', `${platformUrl}/business/login`);
await checkUrl('clinic signup', `${platformUrl}/business/signup`);
await checkUrl('health endpoint', `${platformUrl}/api/health`);
await checkUrl('robots.txt', `${platformUrl}/robots.txt`);
await checkUrl('sitemap.xml', `${platformUrl}/sitemap.xml`);

if (homepage) {
  const requiredHeaders = ['x-content-type-options', 'x-frame-options', 'referrer-policy', 'strict-transport-security'];
  const absent = requiredHeaders.filter(name => !homepage.headers.get(name));
  if (absent.length) {
    console.error(`FAIL security headers: missing ${absent.join(', ')}`);
    process.exitCode = 1;
  } else {
    console.log('PASS security headers');
  }
}

try {
  if (!getApps().length) initializeApp({ credential: cert({
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: env.FIREBASE_PRIVATE_KEY,
  }) });
  const clinics = await getFirestore().collection('clinics').where('active', '==', true).limit(20).get();
  const today = new Date();
  const isPastGrace = value => {
    if (!value) return false;
    const end = new Date(value);
    end.setDate(end.getDate() + 3);
    end.setHours(23, 59, 59, 999);
    return end < today;
  };
  const clinic = clinics.docs.map(doc => doc.data()).find(data => {
    const status = data.subscriptionStatus || 'trial';
    if (status === 'expired' || status === 'cancelled') return false;
    if (status === 'trial' && isPastGrace(data.trialEndDate)) return false;
    if (status === 'active' && isPastGrace(data.subscriptionEndDate)) return false;
    return data.vercelDomain || data.domain;
  });
  if (!clinic) {
    console.warn('WARN tenant smoke test skipped: no active, non-expired clinic is currently available');
  } else {
    const domain = String(clinic.vercelDomain || clinic.domain).replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    for (const route of ['/', '/appointment', '/contact', '/privacy', '/terms']) {
      await checkUrl(`clinic ${domain}${route}`, `https://${domain}${route}`, 200, domain);
    }
  }
} catch (error) {
  console.error(`FAIL clinic discovery: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

if (!process.exitCode) console.log('READY first-client automated release checks passed');
