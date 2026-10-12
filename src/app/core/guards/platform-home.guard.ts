import type { CanMatchFn } from '@angular/router';

export function isPlatformHomeHost(host: string): boolean {
  return host === 'mydentalplatform.com' || host === 'www.mydentalplatform.com'
    || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.onrender.com');
}

/** Only the platform root changes; clinic subdomains retain their own home page. */
export const platformHomeMatch: CanMatchFn = () =>
  typeof window !== 'undefined' && isPlatformHomeHost(window.location.hostname);
