import type { VercelRequest } from '@vercel/node';

const DEFAULT_PLATFORM_URL = process.env['APP_BASE_URL']?.trim() ?? 'https://mydentalplatform.com';

function normalizeHostname(value: string): string {
  return value.trim().toLowerCase().replace(/:\d+$/, '');
}

function getPlatformHostnames(): Set<string> {
  const parsed = new URL(DEFAULT_PLATFORM_URL);
  const hostname = normalizeHostname(parsed.hostname);

  return new Set([
    hostname,
    hostname.replace(/^www\./, ''),
    hostname.startsWith('www.') ? hostname : `www.${hostname}`,
    'localhost',
    '127.0.0.1',
  ]);
}

export function getRequestHostname(req: VercelRequest): string {
  const forwardedHost = req.headers['x-forwarded-host'];
  const hostHeader = Array.isArray(forwardedHost)
    ? forwardedHost[0]
    : forwardedHost ?? req.headers.host ?? new URL(DEFAULT_PLATFORM_URL).host;

  return normalizeHostname(hostHeader);
}

export function getRequestProtocol(req: VercelRequest): string {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  return proto === 'http' ? 'http' : 'https';
}

export function getBaseUrl(req: VercelRequest): string {
  const hostname = getRequestHostname(req);
  const protocol = hostname === 'localhost' || hostname === '127.0.0.1'
    ? 'http'
    : getRequestProtocol(req);
  return `${protocol}://${hostname}`;
}

export function isPlatformHost(hostname: string): boolean {
  return getPlatformHostnames().has(normalizeHostname(hostname));
}

export function getSitemapUrls(baseUrl: string, hostname: string): string[] {
  if (isPlatformHost(hostname)) {
    return [
      `${baseUrl}/business`,
      `${baseUrl}/business/signup`,
    ];
  }

  return [
    `${baseUrl}/`,
    `${baseUrl}/services`,
    `${baseUrl}/about`,
    `${baseUrl}/appointment`,
    `${baseUrl}/gallery`,
    `${baseUrl}/testimonials`,
    `${baseUrl}/contact`,
  ];
}

export function getRobotsTxt(baseUrl: string, hostname: string): string {
  const lines = ['User-agent: *'];

  if (isPlatformHost(hostname)) {
    lines.push('Allow: /business');
    lines.push('Allow: /business/signup');
    lines.push('Disallow: /business/login');
    lines.push('Disallow: /business/clinic');
    lines.push('Disallow: /business/clinics');
    lines.push('Disallow: /business/revenue');
    lines.push('Disallow: /business/analytics');
    lines.push('Disallow: /business/leads');
  } else {
    lines.push('Allow: /');
    lines.push('Disallow: /business');
    lines.push('Disallow: /appointment/confirmed');
    lines.push('Disallow: /my-appointment');
    lines.push('Disallow: /admin');
  }

  lines.push(`Sitemap: ${baseUrl}/sitemap.xml`);
  return `${lines.join('\n')}\n`;
}
