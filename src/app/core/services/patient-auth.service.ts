import { Injectable, computed, inject, signal } from '@angular/core';
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
  private readonly patient = signal<PlatformUser | null>(this.restorePatient());

  readonly user = this.patient.asReadonly();
  readonly isSignedIn = computed(() => this.user() !== null);
  readonly role = this.authFacade.role.asReadonly();
  readonly ready = this.authFacade.authReady;

  async sendVerificationCode(phone: string, _recaptchaContainer: string): Promise<string> {
    const phoneE164 = normalizePatientPhone(phone);
    if (!phoneE164) throw new Error('Enter a valid 10-digit Indian mobile number.');
    const user: PlatformUser = {
      uid: `booking-ref:${phoneE164.slice(-4)}`,
      email: null,
      emailVerified: false,
      phoneNumber: phoneE164,
      clinicId: null,
    };
    this.patient.set(user);
    globalThis.localStorage?.setItem('patient-booking-phone', phoneE164);
    return maskPatientPhone(phoneE164);
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
    this.patient.set(null);
    globalThis.localStorage?.removeItem('patient-booking-phone');
  }

  resetVerification(): void {
    this.patient.set(null);
    globalThis.localStorage?.removeItem('patient-booking-phone');
  }

  private restorePatient(): PlatformUser | null {
    const phoneE164 = globalThis.localStorage?.getItem('patient-booking-phone') ?? '';
    return normalizePatientPhone(phoneE164) ? {
      uid: `booking-ref:${phoneE164.slice(-4)}`,
      email: null,
      emailVerified: false,
      phoneNumber: phoneE164,
      clinicId: null,
    } : null;
  }
}