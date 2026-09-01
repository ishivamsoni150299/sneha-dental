import { Injectable, computed, inject } from '@angular/core';
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
  type User,
} from 'firebase/auth';
import { auth, firebaseAppCheckReady } from '../firebase';
import { AuthFacade } from './auth-facade.service';

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
  private confirmation: ConfirmationResult | null = null;
  private verifier: RecaptchaVerifier | null = null;

  readonly user = computed(() =>
    this.authFacade.role() === 'patient' ? this.authFacade.currentUser() : null,
  );
  readonly isSignedIn = computed(() => this.user() !== null);
  readonly role = this.authFacade.role.asReadonly();
  readonly ready = this.authFacade.authReady;

  async sendVerificationCode(phone: string, recaptchaContainer: string): Promise<string> {
    const phoneE164 = normalizePatientPhone(phone);
    if (!phoneE164) throw new Error('Enter a valid 10-digit Indian mobile number.');

    await firebaseAppCheckReady;
    this.clearVerifier();
    auth.languageCode = 'en';
    this.verifier = new RecaptchaVerifier(auth, recaptchaContainer, { size: 'invisible' });
    try {
      this.confirmation = await signInWithPhoneNumber(auth, phoneE164, this.verifier);
      return maskPatientPhone(phoneE164);
    } catch (error) {
      this.confirmation = null;
      this.clearVerifier();
      throw error;
    }
  }

  async confirmVerificationCode(code: string): Promise<User> {
    if (!this.confirmation) throw new Error('Request a new verification code.');
    if (!/^\d{6}$/.test(code.trim())) throw new Error('Enter the 6-digit verification code.');

    const credential = await this.confirmation.confirm(code.trim());
    this.confirmation = null;
    this.clearVerifier();
    const role = await this.authFacade.resolveCurrentUser();
    if (role !== 'patient') {
      await this.authFacade.logout();
      throw new Error('This phone session could not be opened as a patient account.');
    }
    return credential.user;
  }

  matchingPatientUid(phone: string): string | null {
    const user = this.user();
    return user && normalizePatientPhone(phone) === normalizePatientPhone(user.phoneNumber ?? '')
      ? user.uid
      : null;
  }

  async logout(): Promise<void> {
    this.confirmation = null;
    this.clearVerifier();
    await this.authFacade.logout();
  }

  resetVerification(): void {
    this.confirmation = null;
    this.clearVerifier();
  }

  private clearVerifier(): void {
    this.verifier?.clear();
    this.verifier = null;
  }
}