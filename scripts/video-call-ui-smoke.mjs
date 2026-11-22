// Layout-only smoke test with synthetic API responses. Never contacts production.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';

const root = resolve('dist/mydentalplatform/browser');
const server = createServer(async (req, res) => {
  const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try {
    const extension = extname(path);
    const data = await readFile(extension ? path : resolve(root, 'index.html'));
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[extension] ?? 'text/html');
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browserOptions = {
  ...(process.platform === 'win32' ? { channel: 'chrome' } : {}),
  ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}),
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
};
const screenshots = await mkdtemp(resolve(tmpdir(), 'video-mobile-ui-'));
console.log(`Screenshots: ${screenshots}`);
let page;
let browser;
try {
  for (const [width, height] of [[320, 568], [390, 844], [768, 844], [1440, 900], [844, 390]]) {
    // Isolate Chrome's synthetic camera lifecycle between viewport cases.
    browser = await chromium.launch(browserOptions);
    page = await browser.newPage({ viewport: { width, height } });
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      let body;
      if (path === '/api/public/video-tests/join') body = { provider: 'livekit', url: 'wss://video.example.test', token: 'layout-fixture', expiresAt: new Date(Date.now() + 3600000).toISOString() };
      return route.fulfill({ status: body ? 200 : 401, contentType: 'application/json', body: JSON.stringify(body ?? {}) });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/video-test#layout-fixture`);
    await page.getByRole('button', { name: 'Join test call', exact: true }).click();
    const check = page.getByRole('button', { name: 'Test camera & mic', exact: true });
    await check.waitFor();
    assert.equal(await page.getByRole('link', { name: 'Open Mili home', exact: true }).isVisible(), false);
    for (const name of ['Test camera & mic', 'Join call', 'Listen only', 'Close video consultation']) {
      const control = page.getByRole('button', { name, exact: true });
      await control.scrollIntoViewIfNeeded();
      const box = await control.boundingBox();
      assert.ok(box && box.height >= 44 && box.y >= 0 && box.y + box.height <= height + 1, `${name} is reachable at ${width}×${height}`);
    }
    await check.click();
    await page.getByRole('button', { name: 'Check again', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Turn camera off', exact: true }).click();
    await page.getByRole('button', { name: 'Turn camera on', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Mute microphone', exact: true }).click();
    await page.getByRole('button', { name: 'Unmute microphone', exact: true }).waitFor();
    const message = await page.locator('.stage-message p').boundingBox();
    const toggles = await page.locator('.preview-controls').boundingBox();
    assert.ok(message && toggles && message.y + message.height <= toggles.y, `Preview text clears controls at ${width}×${height}`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Call fits ${width}px`);
    await page.screenshot({ path: resolve(screenshots, `call-${width}.png`) });
    await page.getByRole('button', { name: 'Close video consultation', exact: true }).click();
    await page.getByRole('button', { name: 'Join test call', exact: true }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Open Mili home', exact: true }).isVisible(), true);
    console.log(`PASS call ${width}×${height}: reachable controls, device preview, camera/mic toggles, cancellation`);
    await browser.close();
  }
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: resolve(screenshots, 'failure.png') });
    console.error(await page.locator('app-native-video-room').innerText());
  }
  throw error;
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
