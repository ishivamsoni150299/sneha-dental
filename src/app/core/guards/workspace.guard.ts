import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthFacade } from '../services/auth-facade.service';
import { accountDestination, roleWorkspace } from '../utils/account-navigation';

/** One bookmarked entry point; destination guards still enforce role and subscription access. */
export const workspaceGuard: CanActivateFn = async route => {
  const auth = inject(AuthFacade);
  const router = inject(Router);
  await auth.authReady;
  const role = auth.role();
  return role
    ? router.parseUrl(route.queryParamMap.has('returnUrl')
      ? accountDestination(role, route.queryParamMap.get('returnUrl')) : roleWorkspace(role))
    : router.createUrlTree(['/account'], { queryParams: { returnUrl: '/workspace' } });
};
