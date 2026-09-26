import { Injectable, computed, inject } from '@angular/core';
import { AuthFacade } from './auth-facade.service';

export function normalizePatientPhone(value: string): string | null {
  const nationalNumber = value.startsWith('+91') ? value.slice(3) : value;
  return /^[6-9]\d{9}$/.test(nationalNumber) ? `+91${nationalNumber}` : null;
}

@Injectable({ providedIn: 'root' })
export class PatientAuthService {
  private readonly authFacade = inject(AuthFacade);

  readonly user = computed(() => this.authFacade.role() === 'patient' ? this.authFacade.currentUser() : null);
  readonly isSignedIn = computed(() => this.user() !== null);
  readonly role = this.authFacade.role.asReadonly();
  readonly ready = this.authFacade.authReady;

  matchingPatientUid(phone: string): string | null {
    const user = this.user();
    return user && normalizePatientPhone(phone) === normalizePatientPhone(user.phoneNumber ?? '')
      ? user.uid
      : null;
  }

  async logout(): Promise<void> {
    await this.authFacade.logout();
    globalThis.localStorage?.removeItem('patient-booking-phone');
  }
}
