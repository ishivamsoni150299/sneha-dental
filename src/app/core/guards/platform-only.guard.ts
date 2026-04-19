import { type CanActivateFn } from '@angular/router';

/**
 * Blocks /business routes from being accessed on clinic subdomains.
 *
 * Clinic subdomains (e.g. smile.mydentalplatform.com) serve only the clinic
 * website. The business/admin portal lives exclusively on mydentalplatform.com.
 *
 * If a visitor reaches /business from a clinic subdomain (e.g. by typing the
 * URL manually, or via an old redirect), we hard-navigate them to the platform
 * domain so they land on the correct shell.
 */
export const platformOnlyGuard: CanActivateFn = (): boolean => {
  if (typeof window === 'undefined') return true;

  const host = window.location.hostname;

  // A clinic subdomain ends with .mydentalplatform.com but is NOT www.
  // e.g. smile.mydentalplatform.com, drpatel.mydentalplatform.com
  const isClinicSubdomain =
    host.endsWith('.mydentalplatform.com') &&
    host !== 'www.mydentalplatform.com';

  if (isClinicSubdomain) {
    // Hard cross-origin redirect — preserve the path so /business/login still works
    window.location.href = `https://www.mydentalplatform.com${window.location.pathname}${window.location.search}`;
    return false;
  }

  return true;
};
