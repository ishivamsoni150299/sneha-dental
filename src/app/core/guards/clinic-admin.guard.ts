import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ClinicConfigService } from '../services/clinic-config.service';

/**
 * Guards all clinic-admin routes under /business/clinic/*.
 *
 * Checks (in order):
 *  1. Firebase Auth session is restored (handles page refresh)
 *  2. User is authenticated
 *  3. A clinic doc exists for this user
 *  4. The clinic's subscription is not expired / cancelled
 *
 * Expired/cancelled clinics → /business/clinic/expired (upgrade prompt).
 */
export const clinicAdminGuard: CanActivateFn = async () => {
  const auth      = inject(AuthService);
  const clinicCfg = inject(ClinicConfigService);
  const router    = inject(Router);

  await auth.authReadyPromise;

  if (!auth.isLoggedIn) {
    return router.createUrlTree(['/business/login']);
  }

  // Config may already be loaded (fresh login) — skip Firestore call
  if (!clinicCfg.isLoaded) {
    const uid = auth.currentUser()!.uid;
    const ok  = await clinicCfg.loadByUid(uid);
    if (!ok) return router.createUrlTree(['/business/login']);
  }

  // ── Subscription gate ────────────────────────────────────────────────────
  const cfg    = clinicCfg.config;
  const status = cfg.subscriptionStatus ?? 'trial';

  // Explicitly terminated
  if (status === 'cancelled' || status === 'expired') {
    return router.createUrlTree(['/business/clinic/expired']);
  }

  // Trial past end date (+ 3-day grace)
  if (status === 'trial' && cfg.trialEndDate) {
    if (isPastGrace(cfg.trialEndDate, 3)) {
      return router.createUrlTree(['/business/clinic/expired']);
    }
  }

  // Paid subscription past renewal date (+ 3-day grace)
  if (status === 'active' && cfg.subscriptionEndDate) {
    if (isPastGrace(cfg.subscriptionEndDate, 3)) {
      return router.createUrlTree(['/business/clinic/expired']);
    }
  }

  return true;
};

/** Returns true if the ISO date is more than graceDays in the past. */
function isPastGrace(isoDate: string, graceDays: number): boolean {
  const end = new Date(isoDate);
  end.setDate(end.getDate() + graceDays);
  end.setHours(23, 59, 59, 999);
  return end < new Date();
}
