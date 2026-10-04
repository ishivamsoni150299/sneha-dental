// Read-only HTTP smoke check. Never loads deployment secrets or writes to the service.
const value = process.env.PUBLIC_BASE_URL;
if (!value) throw new Error('Set PUBLIC_BASE_URL explicitly to the deployment to check.');
const base = new URL(value);
if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('Invalid PUBLIC_BASE_URL');
const checks = [
  ['/dentists', 200, 'html'],
  ['/dentists/noida', 200, 'html'],
  ['/appointments', 200, 'html'],
  ['/account', 200, 'html'],
  ['/account?mode=signup&type=clinic', 200, 'html'],
  ['/account/recovery', 200, 'html'],
  ['/business', 200, 'html'],
  ['/business/signup', 200, 'html'],
  ['/api/health', 200, 'health'],
  ['/api/marketplace/clinics?region=Delhi', 200, 'json'],
  ['/api/auth/me', 401, null],
  ['/api/admin/clinics', 401, null],
];
const verifiedAssets = new Set();
async function checkAssets(html, pageUrl) {
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(match => match[1]);
  const styles = [...html.matchAll(/<link\b[^>]*>/gi)]
    .filter(match => /\brel=["']stylesheet["']/i.test(match[0]))
    .map(match => /\bhref=["']([^"']+)["']/i.exec(match[0])?.[1]).filter(Boolean);
  if (!scripts.length || !styles.length) throw new Error('missing application script or stylesheet');
  const baseHref = /<base\b[^>]*\bhref=["']([^"']+)["']/i.exec(html)?.[1];
  const assetBase = new URL(baseHref || pageUrl, pageUrl);
  for (const [paths, kind] of [[scripts, 'script'], [styles, 'stylesheet']]) {
    for (const path of paths) {
      const url = new URL(path, assetBase);
      // Verify application assets only; external integrations have their own acceptance gates.
      if (url.origin !== base.origin || verifiedAssets.has(url.href)) continue;
      const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
      const contentType = response.headers.get('content-type') || '';
      const body = await response.text();
      const expectedType = kind === 'script' ? /(?:javascript|ecmascript)/i : /text\/css/i;
      if (response.status !== 200 || !expectedType.test(contentType) || !body.trim() || /^\s*(?:<!doctype\s+html|<html)/i.test(body)) {
        throw new Error(`unusable ${kind}: ${url.pathname} (HTTP ${response.status}, ${contentType})`);
      }
      verifiedAssets.add(url.href);
      console.log('PASS asset ' + url.pathname);
    }
  }
}
for (const [route, expected, kind] of checks) {
  try {
    const response = await fetch(new URL(route, base), { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
    if (response.status !== expected) throw new Error('expected ' + expected + ', received ' + response.status);
    if (kind === 'json' || kind === 'health') {
      if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('expected JSON');
      const body = await response.json();
      if (kind === 'health' && (body.status !== 'ok' || body.service !== 'mydentalplatform-java' || body.database !== 'postgresql')) {
        throw new Error('expected healthy Spring/PostgreSQL backend; mock preview responses do not qualify');
      }
    }
    if (kind === 'html') {
      const html = await response.text();
      if (!html.includes('<app-root')) throw new Error('missing application shell');
      await checkAssets(html, new URL(route, base));
    }
    console.log('PASS ' + route);
  } catch (error) {
    console.error('FAIL ' + route + ': ' + error.message);
    process.exitCode = 1;
  }
}
if (!process.exitCode) console.log('Deployment HTTP smoke checks passed. This does not certify payment, email, video, backups or client onboarding.');
