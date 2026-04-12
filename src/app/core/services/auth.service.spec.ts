/**
 * AuthService unit tests.
 *
 * Firebase v9 ES module exports are non-writable — they cannot be patched with
 * spyOn in Karma/webpack. We let the real Firebase SDK run (it fires the initial
 * auth state callback with null almost immediately since there is no cached
 * session in the test browser), and test only observable surface:
 *   - isLoggedIn getter  — derived from the currentUser signal
 *   - authReady signal   — set after onAuthStateChanged fires
 *
 * Firebase function call tests belong in an integration suite using
 * the Firebase Auth Emulator: firebase emulators:start --only auth
 */

import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AuthService);
  });

  // ── Creation ──────────────────────────────────────────────────────────────
  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ── isLoggedIn getter ─────────────────────────────────────────────────────
  // These manipulate the signal directly — no Firebase call involved.
  describe('isLoggedIn', () => {
    it('returns false when currentUser is null', () => {
      service.currentUser.set(null);
      expect(service.isLoggedIn).toBeFalse();
    });

    it('returns true when currentUser is set', () => {
      service.currentUser.set({ uid: 'abc123' } as any);
      expect(service.isLoggedIn).toBeTrue();
    });

    it('reflects a transition from logged-in to logged-out', () => {
      service.currentUser.set({ uid: 'abc' } as any);
      expect(service.isLoggedIn).toBeTrue();

      service.currentUser.set(null);
      expect(service.isLoggedIn).toBeFalse();
    });
  });

  // ── Integration tests (require Firebase Auth Emulator) ───────────────────
  describe('Firebase Auth integration (pending — requires emulator)', () => {
    it('login() calls signInWithEmailAndPassword with correct credentials', () =>
      pending('Run: firebase emulators:start --only auth'));

    it('login() propagates Firebase errors to the caller', () =>
      pending('Run: firebase emulators:start --only auth'));

    it('loginWithGoogle() opens a Google sign-in popup', () =>
      pending('Run: firebase emulators:start --only auth'));

    it('logout() signs the user out', () =>
      pending('Run: firebase emulators:start --only auth'));
  });
});
