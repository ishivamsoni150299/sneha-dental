import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function parseEnv(filename) {
  const target = path.join(root, filename);
  if (!fs.existsSync(target)) return {};
  return Object.fromEntries(fs.readFileSync(target, 'utf8').split(/\r?\n/).flatMap(line => {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match) return [];
    return [[match[1], match[2].trim().replace(/^['"]|['"]$/g, '')]];
  }));
}

const env = { ...parseEnv('.env.local'), ...parseEnv('.env.production.local'), ...process.env };
const required = ['JDBC_DATABASE_URL', 'DATABASE_USERNAME', 'DATABASE_PASSWORD', 'JWT_SECRET'];
const missing = required.filter(key => !env[key]);
if (missing.length) {
  console.error(`FAIL configuration: missing ${missing.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('PASS Spring and PostgreSQL configuration is present');
}

if (!env.RESEND_API_KEY) console.warn('WARN password reset email is disabled until RESEND_API_KEY is set');
if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET || !env.RAZORPAY_WEBHOOK_SECRET) {
  console.warn('WARN online billing is disabled until all Razorpay secrets are set');
}
if (!env.SENTRY_DSN) console.warn('WARN browser error reporting is disabled until SENTRY_DSN is set');

const platformUrl = String(env.PUBLIC_BASE_URL || 'http://localhost:8080').replace(/\/$/, '');

async function checkUrl(label, url, expected = 200) {
  try {
    const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15_000) });
    if (response.status !== expected) {
      console.error(`FAIL ${label}: HTTP ${response.status}`);
      process.exitCode = 1;
      return;
    }
    console.log(`PASS ${label}: HTTP ${response.status}`);
  } catch (error) {
    console.error(`FAIL ${label}: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

await checkUrl('platform homepage', `${platformUrl}/business`);
await checkUrl('clinic signup', `${platformUrl}/business/signup`);
await checkUrl('health and PostgreSQL', `${platformUrl}/api/health`);
await checkUrl('robots.txt', `${platformUrl}/robots.txt`);
await checkUrl('sitemap.xml', `${platformUrl}/sitemap.xml`);

if (!process.exitCode) console.log('READY Render deployment smoke checks passed');
