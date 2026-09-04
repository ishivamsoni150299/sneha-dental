import { Injectable, computed, inject } from '@angular/core';
import { AuthFacade, type PlatformUser } from './auth-facade.service';

export function normalizePatientPhone(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  const nationalNumber = digits.startsWith('91') && digits.length === 12
    ? digits.slice(2)
    : digits;
  return /^[6-9]\d{9}$/.test(nationalNumber) ? `+91${nationalNumber}` : null;
}

export function maskPatientPhone(phoneE164: string): string {
  return `${phoneE164.slice(0, 3)} ••••••${phoneE164.slice(-4)}`;
}

@Injectable({ providedIn: 'root' })
export class PatientAuthService {
  private readonly authFacade = inject(AuthFacade);

  readonly user = computed<PlatformUser | null>(() => null);
  readonly isSignedIn = computed(() => this.user() !== null);
  readonly role = this.authFacade.role.asReadonly();
  readonly ready = this.authFacade.authReady;

  async sendVerificationCode(phone: string, _recaptchaContainer: string): Promise<string> {
    const phoneE164 = normalizePatientPhone(phone);
    if (!phoneE164) throw new Error('Enter a valid 10-digit Indian mobile number.');
    throw new Error('Patient sign-in is temporarily unavailable while mobile verification is being replaced.');
  }

  async confirmVerificationCode(_code: string): Promise<PlatformUser> {
    throw new Error('Patient sign-in is temporarily unavailable.');
  }

  matchingPatientUid(phone: string): string | null {
    const user = this.user();
    return user && normalizePatientPhone(phone) === normalizePatientPhone(user.phoneNumber ?? '')
      ? user.uid
      : null;
  }

  async logout(): Promise<void> {
    await this.authFacade.logout();
  }

  resetVerification(): void {
  }
}