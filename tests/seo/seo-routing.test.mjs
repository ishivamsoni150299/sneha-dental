import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import {
  getRobotsTxt,
  getSitemapUrls,
  isPlatformHost,
} from '../../lib/server/seo-utils.ts';

const rootUrl = new URL('../../', import.meta.url);
const vercelConfig = JSON.parse(readFileSync(new URL('vercel.json', rootUrl), 'utf8'));

test('publishes only the platform sales page in platform sitemaps', () => {
  for (const hostname of ['mydentalplatform.com', 'www.mydentalplatform.com']) {
    assert.equal(isPlatformHost(hostname), true);
    assert.deepEqual(
      getSitemapUrls(`https://${hostname}`, hostname),
      [`https://${hostname}/business`],
    );
  }
});

test('keeps clinic-domain sitemaps on patient-facing clinic routes', () => {
  const baseUrl = 'https://smile.example';
  const urls = getSitemapUrls(baseUrl, 'smile.example');

  assert.equal(isPlatformHost('smile.example'), false);
  assert.deepEqual(urls, [
    `${baseUrl}/`,
    `${baseUrl}/services`,
    `${baseUrl}/about`,
    `${baseUrl}/appointment`,
    `${baseUrl}/gallery`,
    `${baseUrl}/testimonials`,
    `${baseUrl}/contact`,
  ]);
  assert.equal(urls.some(url => url.includes('/business')), false);
});

test('advertises the canonical sitemap and excludes private platform areas', () => {
  const robots = getRobotsTxt('https://mydentalplatform.com', 'mydentalplatform.com');

  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Allow: \/business$/m);
  assert.match(robots, /^Disallow: \/business\/clinic$/m);
  assert.match(robots, /^Sitemap: https:\/\/mydentalplatform\.com\/sitemap\.xml$/m);
  assert.doesNotMatch(robots, /Allow: \/business\/signup/);
});

test('limits permanent platform redirects to exact platform hosts', () => {
  assert.equal(vercelConfig.redirects.length, 3);

  const redirectHosts = vercelConfig.redirects.map(rule => rule.has?.[0]?.value);
  assert.deepEqual(
    [...new Set(redirectHosts)].sort(),
    ['^mydentalplatform\\.com$', '^www\\.mydentalplatform\\.com$'],
  );
  assert.equal(redirectHosts.some(pattern => new RegExp(pattern).test('clinic.mydentalplatform.com')), false);
  assert.equal(vercelConfig.redirects.every(rule => rule.has?.[0]?.type === 'host'), true);
  assert.equal(vercelConfig.redirects.every(rule => rule.permanent === true), true);
  assert.equal(
    vercelConfig.redirects.some(rule =>
      rule.source === '/'
      && new RegExp(rule.has[0].value).test('mydentalplatform.com')
      && rule.destination === 'https://mydentalplatform.com/business'),
    true,
  );
});

test('serves host-aware robots through the API and noindexes signup at the edge', () => {
  const robotsRewrite = vercelConfig.rewrites.find(rule => rule.source === '/robots.txt');
  const signupHeaders = vercelConfig.headers.find(rule => rule.source === '/business/signup');

  assert.equal(robotsRewrite?.destination, '/api/seo?type=robots');
  assert.equal(existsSync(new URL('public/robots.txt', rootUrl)), false);
  assert.deepEqual(signupHeaders?.headers, [
    { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
  ]);
});