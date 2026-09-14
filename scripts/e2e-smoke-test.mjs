// Compatibility entrypoint: artifact checks, not browser end-to-end tests.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const output = path.resolve('dist/mydentalplatform/browser');
const index = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
assert.match(index, /<app-root/);
const assets = [...index.matchAll(/(?:src|href)="([^"?#]+\.(?:js|css))"/g)].map(match => match[1]);
assert(assets.length > 0, 'The application shell must reference compiled assets');
for (const asset of assets) {
  if (/^https?:/.test(asset)) continue;
  const file = path.resolve(output, asset.replace(/^\//, ''));
  assert(file.startsWith(output + path.sep), 'Asset path must stay inside the build');
  assert(fs.statSync(file).size > 0, 'Referenced asset must not be empty');
}
assert(fs.existsSync(path.join(output, 'robots.txt')), 'Missing robots.txt');
console.log('PASS production application shell and referenced assets. Browser journeys and external integrations require separate verification.');
