import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourceFile = path.join(root, '.env.production.local');
const localEnvFile = path.join(root, '.env.local');

const keys = [
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'RAZORPAY_PLAN_STARTER',
  'RAZORPAY_PLAN_PRO',
  'RAZORPAY_PLAN_PRO_YEARLY',
  'INTERNAL_API_KEY',
  'SUPPORT_PHONE',
  'SUPPORT_WHATSAPP',
  'ZOHO_SMTP_USER',
  'ZOHO_SMTP_PASS',
  'CRON_SECRET',
];

const targets = ['development', 'preview'];

if (!fs.existsSync(sourceFile)) {
  throw new Error(`Missing source env file: ${sourceFile}`);
}

function parseEnvFile(filePath) {
  const parsed = {};
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (!match) continue;

    let [, key, value] = match;
    value = value.trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith('\'') && value.endsWith('\''))
    ) {
      value = value.slice(1, -1);
    }

    parsed[key] = value
      .replace(/\\r\\n/g, '\r\n')
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"');
  }

  return parsed;
}

const parsed = parseEnvFile(sourceFile);
const localEnv = fs.existsSync(localEnvFile) ? parseEnvFile(localEnvFile) : {};
const projectId = process.env['VERCEL_PROJECT_ID'] ?? localEnv['VERCEL_PROJECT_ID'];
const token = process.env['VERCEL_TOKEN'] ?? localEnv['VERCEL_TOKEN'];

if (!projectId || !token) {
  throw new Error('Missing VERCEL_PROJECT_ID or VERCEL_TOKEN.');
}

for (const target of targets) {
  const requestBody = keys
    .map(key => ({
      key,
      value: parsed[key],
      target: [target],
      type: 'encrypted',
    }))
    .filter(entry => entry.value);

  if (!requestBody.length) continue;

  const response = await fetch(
    `https://api.vercel.com/v10/projects/${projectId}/env?upsert=true`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    },
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Failed syncing ${target}: ${response.status} ${message}`);
  }

  console.log(`synced ${target} (${requestBody.length} vars)`);
}
