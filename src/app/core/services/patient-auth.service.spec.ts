import { maskPatientPhone, normalizePatientPhone } from './patient-auth.service';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AuthFacade, AuthRole, PlatformUser } from './auth-facade.service';
import { PatientAuthService } from './patient-auth.service';

describe('PatientAuthService phone helpers', () => {
  it('never treats a locally stored phone or an OTP request as verification', async () => {
    localStorage.setItem('patient-booking-phone', '+919876543210');
    const auth = { role: signal<AuthRole | null>(null), currentUser: signal<PlatformUser | null>(null), authReady: Promise.resolve(), requestOtp: jasmine.createSpy().and.resolveTo() };
    TestBed.configureTestingModule({providers:[{provide:AuthFacade,useValue:auth}]});
    const service = TestBed.inject(PatientAuthService);
    expect(service.isSignedIn()).toBeFalse();
    await service.sendVerificationCode('9876543210','');
    expect(service.isSignedIn()).toBeFalse(); expect(service.matchingPatientUid('9876543210')).toBeNull();
    localStorage.removeItem('patient-booking-phone');
  });
  it('normalizes supported Indian mobile formats', () => {
    expect(normalizePatientPhone('98765 43210')).toBe('+919876543210');
    expect(normalizePatientPhone('+91 98765 43210')).toBe('+919876543210');
    expect(normalizePatientPhone('12345')).toBeNull();
  });

  it('masks a verified phone for patient-facing copy', () => {
    expect(maskPatientPhone('+919876543210')).toBe('+91 ••••••3210');
  });
});
