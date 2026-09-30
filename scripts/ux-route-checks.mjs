import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

// Read-only route/layout checks. Call only with isolated E2E browser contexts.
export async function checkUxRoutes(page, base, role, paths) {
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
  const dir = 'artifacts/ux-route-checks';
  await mkdir(dir, { recursive: true });
  const failures = [];
  for (const width of [1440, 768, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of paths) {
      const errors = [];
      const onError = error => errors.push(error.message);
      page.on('pageerror', onError);
      try {
        const response = await page.goto(base + path, { waitUntil: 'domcontentloaded' });
        assert.ok(response && response.status() < 400, 'Page must load');
        await page.getByRole('heading').first().waitFor({ timeout: 15000 });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.ok(overflow <= 1, `Horizontal overflow: ${overflow}px`);
        assert.deepEqual(errors, [], 'No uncaught browser errors');
        if (role !== 'public') {
          const pathname = new URL(page.url()).pathname;
          assert.ok(pathname !== '/account' && !pathname.endsWith('/login'), 'Authenticated route must not fall back to login');
        }
        console.log(`PASS UX ${role} ${width}px ${path}`);
      } catch (error) {
        const name = `${role}-${width}-${path.replace(/[^a-z0-9]/gi, '_')}`;
        await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
        failures.push(`${role} ${width}px ${path}: ${error.message}`);
        console.error(`FAIL UX ${failures.at(-1)}`);
      } finally { page.off('pageerror', onError); }
    }
  }
  return failures;
}
