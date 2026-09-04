import { Injectable, inject, signal } from '@angular/core';
import { ClinicConfigService } from './clinic-config.service';

export type AuthRole = 'patient' | 'clinic-admin' | 'platform-admin' | 'incomplete-signup' | 'unverified';

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

  async createAccountWithGoogle(): Promise<{ user: PlatformUser; role: AuthRole }> {
    throw this.authError('auth/provider-disabled', 'Google sign-in is not enabled.');
  }

  async resendVerificationEmail(): Promise<void> {
    throw this.authError('auth/provider-disabled', 'Email verification is not required for new accounts.');
  }

  async refreshVerificationStatus(): Promise<AuthRole> {
    return (await this.resolveCurrentUser()) ?? 'incomplete-signup';
  }

  async sendPasswordReset(_email: string): Promise<void> {
    throw this.authError('auth/provider-disabled', 'Password reset is being migrated. Contact support.');
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
    const response = await this.authRequest('/api/auth/refresh');
    this.applySession(response);
    return response.accessToken;
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
      throw this.authError(code, data.message ?? 'Authentication failed.');
    }
    return data;
  }

  private applySession(response: AuthResponse): AuthRole {
    this.accessToken = response.accessToken;
    this.accessTokenExpiresAt = Date.now() + response.expiresIn * 1000;
    this.currentUser.set({
      uid: response.user.id,
      email: response.user.email,
      emailVerified: true,
      phoneNumber: null,
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