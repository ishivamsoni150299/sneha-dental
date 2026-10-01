import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthFacade } from '../services/auth-facade.service';
import { ClinicConfigService } from '../services/clinic-config.service';

/**
 * Guards all clinic-admin routes under /business/clinic/*.
 *
 * Checks (in order):
 *  1. The Spring authentication session is restored after a page refresh
 *  2. User is authenticated
 *  3. A clinic exists for this user
 *  4. A paid clinic's subscription is not expired / cancelled
 *
 * Expired/cancelled clinics → /business/clinic/expired (upgrade prompt).
 */
export const clinicAdminGuard: CanActivateFn = async (route, state) => {
  const auth      = inject(AuthFacade);
  const clinicCfg = inject(ClinicConfigService);
  const router    = inject(Router);

  await auth.authReady;

  if (!auth.isAuthenticated) {
    return router.createUrlTree(['/account'], {
      queryParams: { returnUrl: state.url },
    });
  }

  if (auth.role() === 'incomplete-signup' || auth.role() === 'unverified') {
    return router.createUrlTree(['/business/signup'], {
      queryParams: { resume: 'true' },
    });
  }

  if (auth.role() !== 'clinic-admin') {
    return router.createUrlTree(['/account']);
  }

  if (!clinicCfg.isLoaded || clinicCfg.config.clinicId === 'default') {
    const uid = auth.currentUser()!.uid;
    const ok  = await clinicCfg.loadByUid(uid, await auth.getFreshIdToken());
    if (!ok) {
      return router.createUrlTree(['/business/signup'], {
        queryParams: { resume: 'true' },
      });
    }
  }

  // ── Subscription gate ────────────────────────────────────────────────────
  const cfg    = clinicCfg.config;
  const status = cfg.subscriptionStatus ?? 'trial';

  const isFree = (cfg.subscriptionPlan ?? 'trial') === 'trial';

  // Free is permanent. Paid plans still require a current subscription.
  const needsRenewal = status === 'cancelled' || (!isFree && (
    status === 'expired' || (status === 'active' && !!cfg.subscriptionEndDate && isPastGrace(cfg.subscriptionEndDate, 3))
  ));
  if (route.data?.['subscriptionRenewal']) {
    return needsRenewal ? true : router.createUrlTree(['/business/clinic/dashboard']);
  }
  if (needsRenewal) return router.createUrlTree(['/business/clinic/expired']);

  return true;
};

/** Returns true if the ISO date is more than graceDays in the past. */
function isPastGrace(isoDate: string, graceDays: number): boolean {
  const end = new Date(isoDate);
  end.setDate(end.getDate() + graceDays);
  end.setHours(23, 59, 59, 999);
  return end < new Date();
}
