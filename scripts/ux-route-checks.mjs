import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

// Read-only route/layout checks. Call only with isolated E2E browser contexts.
export async function checkUxRoutes(sessionPage, base, role, paths) {
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
  const dir = 'artifacts/ux-route-checks';
  await mkdir(dir, { recursive: true });
  const failures = [];
  // Preserve the authenticated context, but release each route's browser resources.
  // A long audit in one renderer can crash before all roles receive coverage.
  await sessionPage.goto('about:blank');
  for (const width of [1440, 768, 390, 320]) {
    for (const path of paths) {
      const page = await sessionPage.context().newPage();
      await page.setViewportSize({ width, height: 900 });
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
        if (process.env.E2E_UX_SCREENSHOTS === '1' && width === 390) {
          await page.screenshot({ path: `${dir}/${role}-${width}-${path.replace(/[^a-z0-9]/gi, '_')}.png`, fullPage: true });
        }
        console.log(`PASS UX ${role} ${width}px ${path}`);
      } catch (error) {
        const name = `${role}-${width}-${path.replace(/[^a-z0-9]/gi, '_')}`;
        failures.push(`${role} ${width}px ${path}: ${error.message}`);
        console.error(`FAIL UX ${failures.at(-1)}`);
        await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true, timeout: 5000 })
          .catch(screenshotError => console.error(`Screenshot unavailable: ${screenshotError.message}`));
      } finally { page.off('pageerror', onError); await page.close(); }
    }
  }
  return failures;
}
