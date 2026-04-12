import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ClinicConfigService } from '../services/clinic-config.service';

/**
 * Guards all clinic-admin routes under /business/clinic/*.
 *
 * On first login the LoginComponent already calls clinicCfg.loadByUid() so the
 * config is ready immediately. On a page refresh we wait for Firebase Auth to
 * restore the session, then lazy-load the clinic config by UID if not already
 * loaded (hostname won't match on mydentalplatform.com).
 */
export const clinicAdminGuard: CanActivateFn = async () => {
  const auth      = inject(AuthService);
  const clinicCfg = inject(ClinicConfigService);
  const router    = inject(Router);

  // Wait for Firebase Auth to restore session from localStorage (handles F5 refresh)
  await auth.authReadyPromise;

  if (!auth.isLoggedIn) {
    return router.createUrlTree(['/business/login']);
  }

  // Config may already be loaded (fresh login) — skip Firestore call
  if (clinicCfg.isLoaded) return true;

  // Page refresh: config not yet loaded — fetch by UID
  const uid = auth.currentUser()!.uid;
  const ok  = await clinicCfg.loadByUid(uid);

  if (!ok) {
    // Authenticated but no clinic doc — redirect to login
    return router.createUrlTree(['/business/login']);
  }

  return true;
};
