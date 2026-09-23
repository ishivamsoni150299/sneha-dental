import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';

for (const mock of [false, true]) {
  test(mock ? 'rejects preview health even when all routes appear healthy' : 'accepts healthy backend and protected routes', async () => {
    const server = http.createServer((request, response) => {
      const route = request.url;
      if (route.startsWith('/api/auth/') || route.startsWith('/api/admin/')) {
        response.writeHead(401).end();
      } else if (route.startsWith('/api/')) {
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify(route === '/api/health'
          ? { status: 'ok', service: mock ? 'preview-backend' : 'mydentalplatform-java', database: mock ? undefined : 'postgresql', db: 'up' }
          : []));
      } else {
        response.end('<html><app-root></app-root></html>');
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
      assert.equal(code, mock ? 1 : 0, output);
      if (mock) assert.match(output, /mock preview responses do not qualify/);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });
}
