import { Injectable } from '@angular/core';
import { getIdToken } from 'firebase/auth';
import { auth } from '../firebase';

@Injectable({ providedIn: 'root' })
export class AuthenticatedApiService {
  async fetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const user = auth.currentUser;
    if (!user) throw new Error('Please sign in again to continue.');

    const idToken = await getIdToken(user, true);
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${idToken}`);

    return fetch(input, { ...init, headers });
  }
}
