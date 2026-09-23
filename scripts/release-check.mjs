// Read-only HTTP smoke check. Never loads deployment secrets or writes to the service.
const value = process.env.PUBLIC_BASE_URL;
if (!value) throw new Error('Set PUBLIC_BASE_URL explicitly to the deployment to check.');
const base = new URL(value);
if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('Invalid PUBLIC_BASE_URL');
const checks = [
  ['/business', 200, 'html'],
  ['/business/signup', 200, 'html'],
  ['/api/health', 200, 'health'],
  ['/api/marketplace/clinics?region=Delhi', 200, 'json'],
  ['/api/auth/me', 401, null],
  ['/api/admin/clinics', 401, null],
];
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
    if (kind === 'html' && !(await response.text()).includes('<app-root')) throw new Error('missing application shell');
    console.log('PASS ' + route);
  } catch (error) {
    console.error('FAIL ' + route + ': ' + error.message);
    process.exitCode = 1;
  }
}
if (!process.exitCode) console.log('Deployment HTTP smoke checks passed. This does not certify payment, email, video, backups or client onboarding.');
