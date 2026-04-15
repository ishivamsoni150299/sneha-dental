import { inject } from '@angular/core';
import { type CanActivateFn, Router, type UrlTree } from '@angular/router';
import { ClinicConfigService } from '../services/clinic-config.service';

/**
 * Blocks patient-facing routes when no clinic config was loaded.
 * This happens on the platform admin domain (e.g. mydentalplatform.com)
 * which has no matching clinic doc in Firestore.
 *
 * Always returns a UrlTree on denial — never a boolean false — so Angular
 * can compose guards correctly and avoid a double-navigation race condition.
 */
export const clinicRequiredGuard: CanActivateFn = (): true | UrlTree => {
  const clinic = inject(ClinicConfigService);
  const router = inject(Router);

  if (!clinic.isLoaded) {
    return router.createUrlTree(['/business']);
  }

  if (clinic.config.comingSoon) {
    return router.createUrlTree(['/coming-soon']);
  }

  return true;
};
