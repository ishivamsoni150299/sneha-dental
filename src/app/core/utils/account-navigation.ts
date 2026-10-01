import { inject } from '@angular/core';
import { Router, type RedirectFunction } from '@angular/router';
import type { AuthRole } from '../services/auth-facade.service';

export function accountDestination(role: AuthRole, returnUrl: string | null = null): string {
  const fallback = role === 'patient' ? '/appointments'
    : role === 'dentist' ? '/professional/workspace'
      : role === 'clinic-admin' ? '/business/clinic/dashboard'
        : role === 'platform-admin' ? '/business/clinics' : '/business/signup?resume=true';
  if (!returnUrl || !returnUrl.startsWith('/') || returnUrl.startsWith('//')) return fallback;
  const path = returnUrl.split(/[?#]/)[0];
  if (/[\\\s%]/.test(path) || Array.from(path).some(character => character.charCodeAt(0) < 32) || path.split('/').some(segment => segment === '.' || segment === '..')) return fallback;
  const allowed = role === 'patient' ? /^(?:\/appointments|\/my-appointment|\/appointment|\/dentists\/[^/]+\/book)$/.test(path)
    : role === 'dentist' ? /^\/professional\/(?:workspace|profile|video-test)$/.test(path)
      : role === 'clinic-admin' ? /^\/business\/clinic\/(?:dashboard|settings|doctors|patients|reviews|expired)$/.test(path)
        : role === 'platform-admin' ? /^\/business\/(?:clinics(?:\/new|\/[^/]+\/edit)?|dentists\/verification|reviews|analytics|patient-requests|revenue|leads(?:\/new|\/discover|\/[^/]+\/edit)?)$/.test(path) : path === '/business/signup';
  return allowed ? returnUrl : fallback;
}

export const accountRedirect: RedirectFunction = ({ queryParams }) =>
  inject(Router).createUrlTree(['/account'], { queryParams });

export const recoveryRedirect: RedirectFunction = ({ queryParams }) =>
  inject(Router).createUrlTree(['/account/recovery'], { queryParams });

export const dentistSignupRedirect: RedirectFunction = ({ queryParams }) =>
  inject(Router).createUrlTree(['/account'], { queryParams: { ...queryParams, mode: 'signup', type: 'dentist' } });
