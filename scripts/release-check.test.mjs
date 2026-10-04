import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';

for (const scenario of ['healthy', 'preview', 'missing-script', 'html-script', 'empty-style', 'missing-entry']) {
  test(`deployment gate: ${scenario}`, async () => {
    const mock = scenario === 'preview';
    const shell = `<html><head><base href="/"><link rel="stylesheet" href="styles.css"></head><body><app-root></app-root>${scenario === 'missing-entry' ? '' : '<script src="main.js" type="module"></script>'}</body></html>`;
    const server = http.createServer((request, response) => {
      const route = request.url;
      if (route === '/main.js') {
        response.writeHead(scenario === 'missing-script' ? 404 : 200, { 'Content-Type': scenario === 'html-script' ? 'text/html' : 'text/javascript' })
          .end(scenario === 'html-script' ? shell : 'console.log("test application");');
      } else if (route === '/styles.css') {
        response.writeHead(200, { 'Content-Type': 'text/css' }).end(scenario === 'empty-style' ? '' : 'body { margin: 0; }');
      } else if (route.startsWith('/api/auth/') || route.startsWith('/api/admin/')) {
        response.writeHead(401).end();
      } else if (route.startsWith('/api/')) {
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify(route === '/api/health'
          ? { status: 'ok', service: mock ? 'preview-backend' : 'mydentalplatform-java', database: mock ? undefined : 'postgresql', db: 'up' }
          : []));
      } else {
        response.writeHead(200, { 'Content-Type': 'text/html' }).end(shell);
      }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const child = spawn(process.execPath, ['scripts/release-check.mjs'], {
        env: { ...process.env, PUBLIC_BASE_URL: `http://127.0.0.1:${server.address().port}` },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      child.stdout.on('data', data => { output += data; });
      child.stderr.on('data', data => { output += data; });
      const code = await new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('close', resolve);
      });
      assert.equal(code, scenario === 'healthy' ? 0 : 1, output);
      if (mock) assert.match(output, /mock preview responses do not qualify/);
      if (scenario.includes('script')) assert.match(output, /unusable script/);
      if (scenario === 'empty-style') assert.match(output, /unusable stylesheet/);
      if (scenario === 'missing-entry') assert.match(output, /missing application script/);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });
}
