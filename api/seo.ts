import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  getBaseUrl,
  getRequestHostname,
  getRobotsTxt,
  getSitemapUrls,
} from '../lib/server/seo-utils';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function sendSitemap(req: VercelRequest, res: VercelResponse): VercelResponse {
  const hostname = getRequestHostname(req);
  const baseUrl = getBaseUrl(req);
  const urls = getSitemapUrls(baseUrl, hostname);
  const lastmod = new Date().toISOString();

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(url => `  <url>
    <loc>${escapeXml(url)}</loc>
    <lastmod>${lastmod}</lastmod>
  </url>`).join('\n')}
</urlset>
`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=1800');

  return res.status(200).send(body);
}

function sendRobots(req: VercelRequest, res: VercelResponse): VercelResponse {
  const hostname = getRequestHostname(req);
  const baseUrl = getBaseUrl(req);
  const content = getRobotsTxt(baseUrl, hostname);

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=1800');

  return res.status(200).send(content);
}

export default function handler(req: VercelRequest, res: VercelResponse): VercelResponse {
  const type = typeof req.query['type'] === 'string' ? req.query['type'] : '';

  if (type === 'robots') {
    return sendRobots(req, res);
  }

  if (type === 'sitemap') {
    return sendSitemap(req, res);
  }

  return res.status(400).json({ error: 'Unknown SEO type' });
}
