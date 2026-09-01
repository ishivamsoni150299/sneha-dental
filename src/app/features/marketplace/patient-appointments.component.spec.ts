import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import {
  PatientAppointmentApiService,
  type PatientAppointmentSummary,
} from '../../core/services/patient-appointment-api.service';
import { PatientAuthService } from '../../core/services/patient-auth.service';
import { PatientAppointmentsComponent } from './patient-appointments.component';

function patientAuth(signedIn: boolean) {
  return {
    role: signal(signedIn ? 'patient' : null),
    isSignedIn: signal(signedIn),
    ready: Promise.resolve(),
    sendVerificationCode: jasmine.createSpy('sendVerificationCode'),
    confirmVerificationCode: jasmine.createSpy('confirmVerificationCode'),
    resetVerification: jasmine.createSpy('resetVerification'),
    logout: jasmine.createSpy('logout').and.resolveTo(),
  };
}

function appointmentSummary(): PatientAppointmentSummary {
  return {
    id: 'appointment-1', clinicId: 'clinic-1', clinicName: 'Smile Care',
    clinicPhone: '+919000000000', clinicAddress: 'Sector 18, Noida',
    marketplaceSlug: 'smile-care-noida', bookingRef: 'SC-ABCDEFGH',
    patientName: 'Riya', service: 'Consultation', date: '2026-09-10', time: '10:00',
    doctorName: 'Dr. Asha', status: 'confirmed', cancellationReason: '',
    confirmationDeadline: null, confirmationRespondedAt: null, confirmedAt: null,
    declinedAt: null, expiredAt: null, createdAt: null, updatedAt: null,
  };
}

async function createFixture(options: { signedIn?: boolean; claim?: string } = {}) {
  const auth = patientAuth(options.signedIn === true);
  const api = jasmine.createSpyObj<PatientAppointmentApiService>('PatientAppointmentApiService', [
    'session', 'claim', 'cancel', 'availability', 'reschedule',
  ]);
  api.session.and.resolveTo({ profile: { phoneMasked: '+91 ••••••3210' }, appointments: [] });
  api.availability.and.resolveTo([]);
  await TestBed.configureTestingModule({
    imports: [PatientAppointmentsComponent],
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            queryParamMap: convertToParamMap(options.claim ? { claim: options.claim } : {}),
          },
        },
      },
      { provide: PatientAuthService, useValue: auth },
      { provide: PatientAppointmentApiService, useValue: api },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(PatientAppointmentsComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, auth, api };
}

describe('PatientAppointmentsComponent', () => {
  it('starts with phone verification for a guest', async () => {
    const { fixture, api } = await createFixture();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Verify your mobile');
    expect(text).toContain('Private by design');
    expect(api.session).not.toHaveBeenCalled();
  });

  it('loads safe appointment history for a signed-in patient', async () => {
    const { fixture, api } = await createFixture({ signedIn: true });
    api.session.and.resolveTo({
      profile: { phoneMasked: '+91 ••••••3210' },
      appointments: [appointmentSummary()],
    });

    await fixture.componentInstance.loadSession();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Smile Care');
    expect(text).toContain('SC-ABCDEFGH');
    expect(text).toContain('Confirmed');
  });

  it('prefills a post-booking claim reference', async () => {
    const { fixture } = await createFixture({ claim: 'sc-abcd1234' });
    expect(fixture.componentInstance.claimForm.controls.bookingRef.value).toBe('SC-ABCD1234');
  });

  it('offers only server-approved times when rescheduling', async () => {
    const { fixture, api } = await createFixture({ signedIn: true });
    const appointment = appointmentSummary();
    api.availability.and.resolveTo(['11:30', '12:00']);
    fixture.componentInstance.appointments.set([appointment]);

    await fixture.componentInstance.openReschedule(appointment);
    fixture.detectChanges();

    expect(api.availability).toHaveBeenCalledWith(appointment.id, appointment.date);
    expect(fixture.componentInstance.rescheduleSlots()).toEqual(['11:30', '12:00']);
    const values = Array.from(
      fixture.nativeElement.querySelectorAll('select[id^="reschedule-time-"] option') as NodeListOf<HTMLOptionElement>,
    ).map(option => option.value);
    expect(values).toEqual(['', '11:30', '12:00']);
  });
});