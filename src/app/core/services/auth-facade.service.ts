import { Injectable, inject, signal } from '@angular/core';
import { ClinicConfigService } from './clinic-config.service';

export type AuthRole = 'patient' | 'dentist' | 'clinic-admin' | 'platform-admin' | 'incomplete-signup' | 'unverified';

export interface PlatformUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  phoneNumber: string | null;
  clinicId: string | null;
}

interface AuthResponse {
  accessToken: string;
  expiresIn: number;
  user: {
    id: string;
    clinicId: string | null;
    role: AuthRole;
    email: string | null;
    phoneNumber?: string | null;
    emailVerified?: boolean;
    phoneVerified?: boolean;
  };
}

@Injectable({ providedIn: 'root' })
export class AuthFacade {
  private readonly clinicConfig = inject(ClinicConfigService);
  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;
  private readyResolved = false;
  private resolveReady!: () => void;
  private refreshRequest: Promise<string> | null = null;
  private sessionGeneration = 0;

  readonly currentUser = signal<PlatformUser | null>(null);
  readonly role = signal<AuthRole | null>(null);
  readonly ready = signal(false);
  readonly authReady = new Promise<void>(resolve => { this.resolveReady = resolve; });

  constructor() {
    void this.restoreSession();
  }

  get isAuthenticated(): boolean {
    return this.currentUser() !== null;
  }

  async signInWithEmail(email: string, password: string): Promise<AuthRole> {
    return this.applySession(await this.authRequest('/api/auth/clinic/login', { email, password }));
  }

  async signInWithGoogle(): Promise<AuthRole> {
    throw this.authError('auth/provider-disabled', 'Google sign-in is not enabled.');
  }

  async createAccountWithEmail(email: string, password: string): Promise<PlatformUser> {
    this.applySession(await this.authRequest('/api/auth/clinic/signup', { email, password }));
    return this.currentUser()!;
  }

  async requestOtp(identity: string, portal: 'patient' | 'clinic' | 'platform' | 'dentist'): Promise<void> {
    await this.passwordResetRequest('/api/auth/otp/request', { identity, portal });
  }

  async verifyOtp(identity: string, portal: 'patient' | 'clinic' | 'platform' | 'dentist', code: string, fullName?: string): Promise<AuthRole> {
    await this.authReady;
    return this.applySession(await this.authRequest('/api/auth/otp/verify', { identity, portal, code, fullName }));
  }

  async exchangeMagicLink(accessToken: string, portal: 'clinic' | 'platform' | 'dentist', fullName?: string): Promise<AuthRole> {
    await this.authReady;
    return this.applySession(await this.authRequest('/api/auth/otp/exchange-link', { accessToken, portal, fullName }));
  }

  async createProfessionalAccount(fullName: string, email: string, password: string): Promise<PlatformUser> {
    this.applySession(await this.authRequest('/api/auth/professional/signup', { fullName, email, password }));
    return this.currentUser()!;
  }

  async signInProfessional(email: string, password: string): Promise<AuthRole> {
    return this.applySession(await this.authRequest('/api/auth/professional/login', { email, password }));
  }

  async createAccountWithGoogle(): Promise<{ user: PlatformUser; role: AuthRole }> {
    throw this.authError('auth/provider-disabled', 'Google sign-in is not enabled.');
  }

  async resendVerificationEmail(): Promise<void> {
    throw this.authError('auth/provider-disabled', 'Email verification is not required for new accounts.');
  }

  async refreshVerificationStatus(): Promise<AuthRole> {
    return (await this.resolveCurrentUser()) ?? 'incomplete-signup';
  }

  async sendPasswordReset(email: string): Promise<void> {
    await this.passwordResetRequest('/api/auth/password-reset/request', { email });
  }

  async confirmPasswordReset(email: string, token: string, password: string): Promise<void> {
    await this.passwordResetRequest('/api/auth/password-reset/complete', { email, token, password });
  }

  async getFreshIdToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt - 30_000) return this.accessToken;
    if (!this.refreshRequest) {
      this.refreshRequest = this.refreshSession().finally(() => { this.refreshRequest = null; });
    }
    return this.refreshRequest;
  }

  async resolveCurrentUser(): Promise<AuthRole | null> {
    try {
      await this.refreshSession();
      return this.role();
    } catch {
      this.clearSession();
      return null;
    }
  }

  async logout(): Promise<void> {
    this.sessionGeneration++;
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } finally {
      this.clearSession();
      this.clinicConfig.resetToPlatformTheme();
    }
  }

  private async restoreSession(): Promise<void> {
    try {
      await this.refreshSession();
    } catch {
      this.clearSession();
    } finally {
      if (!this.readyResolved) {
        this.readyResolved = true;
        this.ready.set(true);
        this.resolveReady();
      }
    }
  }

  private async refreshSession(): Promise<string> {
    const generation = this.sessionGeneration;
    const refresh = async () => {
      const response = await this.authRequest('/api/auth/refresh');
      if (generation !== this.sessionGeneration) throw this.authError('auth/session-expired', 'Sign in again.');
      this.applySession(response);
      return response.accessToken;
    };
    return typeof navigator !== 'undefined' && navigator.locks
      ? navigator.locks.request('mydentalplatform-auth-refresh', refresh) : refresh();
  }

  private async authRequest(path: string, body?: object): Promise<AuthResponse> {
    const response = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({})) as AuthResponse & { code?: string; message?: string };
    if (!response.ok) {
      const code = response.status === 409 ? 'auth/email-already-in-use' :
        data.code === 'password_migration_required' ? 'auth/password-migration-required' :
        'auth/invalid-credential';
      throw this.authError(response.status === 429 ? 'auth/too-many-requests' : code,
        (data as { detail?: string }).detail ?? data.message ?? 'Authentication failed.');
    }
    return data;
  }

  private async passwordResetRequest(path: string, body: object): Promise<void> {
    let response: Response;
    try {
      response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      throw this.authError('auth/network-request-failed', 'Check your internet connection and try again.');
    }
    if (response.ok) return;
    const data = await response.json().catch(() => ({})) as { detail?: string; message?: string };
    const code = response.status === 429 ? 'auth/too-many-requests' :
      response.status === 503 ? 'auth/provider-disabled' : 'auth/invalid-action-code';
    throw this.authError(code, data.detail ?? data.message ?? 'Password reset failed.');
  }

  private applySession(response: AuthResponse): AuthRole {
    this.accessToken = response.accessToken;
    this.accessTokenExpiresAt = Date.now() + response.expiresIn * 1000;
    this.currentUser.set({
      uid: response.user.id,
      email: response.user.email,
      emailVerified: response.user.emailVerified === true,
      phoneNumber: response.user.phoneVerified ? response.user.phoneNumber ?? null : null,
      clinicId: response.user.clinicId,
    });
    this.role.set(response.user.role);
    return response.user.role;
  }

  private clearSession(): void {
    this.accessToken = null;
    this.accessTokenExpiresAt = 0;
    this.currentUser.set(null);
    this.role.set(null);
  }

  private authError(code: string, message: string): Error & { code: string } {
    return Object.assign(new Error(message), { code });
  }
}
