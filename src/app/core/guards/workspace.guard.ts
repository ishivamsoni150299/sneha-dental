import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthFacade } from '../services/auth-facade.service';
import { accountDestination } from '../utils/account-navigation';

/** One bookmarked entry point; destination guards still enforce role and subscription access. */
export const workspaceGuard: CanActivateFn = async route => {
  const auth = inject(AuthFacade);
  const router = inject(Router);
  await auth.authReady;
  const role = auth.role();
  return role
    ? router.parseUrl(accountDestination(role, route.queryParamMap.get('returnUrl')))
    : router.createUrlTree(['/account'], { queryParams: { returnUrl: '/workspace' } });
};
