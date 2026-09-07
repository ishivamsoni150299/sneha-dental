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
  private pendingPhone: string | null = null;

  readonly user = computed(() => this.authFacade.role() === 'patient' && this.authFacade.currentUser()?.phoneNumber ? this.authFacade.currentUser() : null);
  readonly isSignedIn = computed(() => this.user() !== null);
  readonly role = this.authFacade.role.asReadonly();
  readonly ready = this.authFacade.authReady;

  async sendVerificationCode(phone: string, _recaptchaContainer: string): Promise<string> {
    const phoneE164 = normalizePatientPhone(phone);
    if (!phoneE164) throw new Error('Enter a valid 10-digit Indian mobile number.');
    await this.authFacade.requestOtp(phoneE164, 'patient');
    this.pendingPhone = phoneE164;
    return maskPatientPhone(phoneE164);
  }

  async confirmVerificationCode(code: string): Promise<PlatformUser> {
    if (!this.pendingPhone) throw new Error('Request a code first.');
    await this.authFacade.verifyOtp(this.pendingPhone, 'patient', code);
    this.pendingPhone = null;
    const user = this.user();
    if (!user) throw new Error('Mobile verification could not be completed.');
    return user;
  }

  matchingPatientUid(phone: string): string | null {
    const user = this.user();
    return user && normalizePatientPhone(phone) === normalizePatientPhone(user.phoneNumber ?? '')
      ? user.uid
      : null;
  }

  async logout(): Promise<void> {
    this.pendingPhone = null;
    await this.authFacade.logout();
    globalThis.localStorage?.removeItem('patient-booking-phone');
  }

  resetVerification(): void {
    this.pendingPhone = null;
    globalThis.localStorage?.removeItem('patient-booking-phone');
  }

}
