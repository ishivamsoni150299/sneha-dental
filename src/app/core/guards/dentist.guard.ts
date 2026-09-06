import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthFacade } from '../services/auth-facade.service';

export const dentistGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthFacade);
  const router = inject(Router);
  await auth.authReady;
  return auth.role() === 'dentist'
    ? true
    : router.createUrlTree(['/professional/login'], { queryParams: { returnUrl: state.url } });
};

