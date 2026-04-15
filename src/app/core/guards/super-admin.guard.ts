import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { SuperAuthService } from '../services/super-auth.service';

export const superAdminGuard: CanActivateFn = async () => {
  const auth   = inject(SuperAuthService);
  const router = inject(Router);

  await auth.authReady;   // wait for Firebase Auth to restore session on page refresh

  if (auth.isLoggedIn) return true;
  return router.createUrlTree(['/business/login']);
};
