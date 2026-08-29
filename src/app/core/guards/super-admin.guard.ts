import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthFacade } from '../services/auth-facade.service';

export const superAdminGuard: CanActivateFn = async (_route, state) => {
  const auth   = inject(AuthFacade);
  const router = inject(Router);

  await auth.authReady;

  if (auth.role() === 'platform-admin') return true;
  return router.createUrlTree(['/platform/login'], {
    queryParams: { returnUrl: state.url },
  });
};
