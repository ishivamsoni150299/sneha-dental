import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBaseUrl, getRequestHostname, getRobotsTxt } from '../lib/server/seo-utils';

export default function handler(req: VercelRequest, res: VercelResponse): VercelResponse {
  const hostname = getRequestHostname(req);
  const baseUrl = getBaseUrl(req);
  const content = getRobotsTxt(baseUrl, hostname);

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=1800');

  return res.status(200).send(content);
}
