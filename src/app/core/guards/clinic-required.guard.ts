import { inject } from '@angular/core';
import { type CanActivateFn, Router, type UrlTree } from '@angular/router';
import { ClinicConfigService } from '../services/clinic-config.service';

/**
 * Blocks patient-facing routes when no clinic config was loaded.
 *
 * On the platform domain (mydentalplatform.com) with no clinic match:
 *   → redirect to /business (platform portal)
 *
 * On a clinic subdomain (e.g. smile.mydentalplatform.com) with no match:
 *   → hard cross-origin redirect to www.mydentalplatform.com
 *   This prevents the business portal from appearing on clinic subdomains.
 */
export const clinicRequiredGuard: CanActivateFn = (): boolean | UrlTree => {
  const clinic = inject(ClinicConfigService);
  const router = inject(Router);

  if (typeof window === 'undefined') {
    return true;
  }

  if (!clinic.isLoaded) {
    const host = window.location.hostname;
    const isClinicSubdomain =
      host.endsWith('.mydentalplatform.com') &&
      host !== 'www.mydentalplatform.com';

    if (isClinicSubdomain) {
      // Hard redirect to platform — keeps the admin portal off clinic subdomains
      window.location.href = 'https://www.mydentalplatform.com/business';
      return false;
    }

    return router.createUrlTree(['/business']);
  }

  if (clinic.config.comingSoon) {
    return router.createUrlTree(['/coming-soon']);
  }

  return true;
};
