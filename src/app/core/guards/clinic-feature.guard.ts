import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import {
  clinicHasPlatformFeature,
  type PlatformFeatureId,
} from '../config/clinic.config';
import { ClinicConfigService } from '../services/clinic-config.service';

export const clinicFeatureGuard: CanActivateFn = route => {
  const clinic = inject(ClinicConfigService);
  const router = inject(Router);
  const feature = route.data['platformFeature'] as PlatformFeatureId | undefined;

  if (!feature || clinicHasPlatformFeature(clinic.config, feature)) return true;

  return router.createUrlTree(['/business/clinic/settings'], {
    queryParams: { tab: 'subscription', requiredFeature: feature },
  });
};