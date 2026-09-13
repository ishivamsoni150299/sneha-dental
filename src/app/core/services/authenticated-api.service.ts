import { Injectable, inject } from '@angular/core';
import { AuthFacade } from './auth-facade.service';

@Injectable({ providedIn: 'root' })
export class AuthenticatedApiService {
  private readonly auth = inject(AuthFacade);

  async fetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const idToken = await this.auth.getFreshIdToken();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${idToken}`);

    const response = await fetch(input, { ...init, headers, credentials: 'include' });
    if (response.status !== 401) return response;
    const refreshedToken = await this.auth.getFreshIdToken(true);
    headers.set('Authorization', `Bearer ${refreshedToken}`);
    return fetch(input, { ...init, headers, credentials: 'include' });
  }
}
