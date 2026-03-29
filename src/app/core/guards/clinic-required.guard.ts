import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ClinicConfigService } from '../services/clinic-config.service';

/**
 * Blocks patient-facing routes when no clinic config was loaded.
 * This happens on the platform admin domain (e.g. dental-saas.vercel.app)
 * which has no matching clinic doc in Firestore.
 * Redirects to /business so the platform landing page is shown instead.
 */
export const clinicRequiredGuard: CanActivateFn = () => {
  const clinic = inject(ClinicConfigService);
  const router = inject(Router);

  if (clinic.isLoaded) return true;
  router.navigate(['/business']);
  return false;
};
