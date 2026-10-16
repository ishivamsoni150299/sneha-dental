import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import {
  PatientAppointmentApiService,
  type PatientAppointmentSummary,
} from '../../core/services/patient-appointment-api.service';
import { PatientAuthService } from '../../core/services/patient-auth.service';
import { PatientAppointmentsComponent } from './patient-appointments.component';
import { AuthFacade } from '../../core/services/auth-facade.service';

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
    declinedAt: null, expiredAt: null, createdAt: null, updatedAt: null, review: null,
  };
}

async function createFixture(options: { signedIn?: boolean; claim?: string } = {}) {
  const auth = patientAuth(options.signedIn === true);
  const api = jasmine.createSpyObj<PatientAppointmentApiService>('PatientAppointmentApiService', [
    'session', 'requestClaim', 'completeClaim', 'cancel', 'availability', 'reschedule', 'submitReview', 'reportReview',
  ]);
  api.session.and.resolveTo({ profile: { accountLabel: 'patient@example.com' }, appointments: [] });
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
      { provide: AuthFacade, useValue: { authReady: Promise.resolve(), currentUser: signal(null), role: signal(null) } },
      { provide: PatientAppointmentApiService, useValue: api },
    ],
  }).compileComponents();
  spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
  const fixture = TestBed.createComponent(PatientAppointmentsComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, auth, api };
}

describe('PatientAppointmentsComponent', () => {
  it('puts upcoming visits first by time and history newest first without changing source data', async () => {
    const { fixture } = await createFixture({ signedIn: true });
    const base = appointmentSummary();
    const visits = [
      { ...base, id: 'cancelled', status: 'cancelled', date: '2099-12-01' },
      { ...base, id: 'later', date: '2099-11-01' },
      { ...base, id: 'old', status: 'completed', date: '2000-01-01' },
      { ...base, id: 'next', status: 'pending', date: '2099-10-01' },
    ];
    fixture.componentInstance.appointments.set(visits);
    expect(fixture.componentInstance.orderedAppointments().map(visit => visit.id)).toEqual(['next', 'later', 'cancelled', 'old']);
    expect(fixture.componentInstance.appointments()).toEqual(visits);
  });

  it('applies the same 24-hour cancellation cutoff to minute and second precision times', async () => {
    const { fixture } = await createFixture({ signedIn: true });
    spyOn(Date, 'now').and.returnValue(new Date('2026-10-16T10:00:00+05:30').getTime());
    for (const time of ['10:00', '10:00:00']) {
      expect(fixture.componentInstance.canCancel({ ...appointmentSummary(), date: '2026-10-18', time })).toBeTrue();
      expect(fixture.componentInstance.canCancel({ ...appointmentSummary(), date: '2026-10-17', time })).toBeFalse();
      expect(fixture.componentInstance.canCancel({ ...appointmentSummary(), status: 'cancelled', date: '2026-10-18', time })).toBeFalse();
    }
  });

  it('requires a password account before loading patient appointment history', async () => {
    const { fixture, api } = await createFixture();
    const text = fixture.nativeElement.textContent as string;
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/account'], { queryParams: { returnUrl: '/' }, replaceUrl: true });
    expect(text).not.toContain('Email address');
    expect(text).not.toContain('Send verification code');
    expect(api.session).not.toHaveBeenCalled();
  });

  it('loads safe appointment history for a signed-in patient', async () => {
    const { fixture, api } = await createFixture({ signedIn: true });
    api.session.and.resolveTo({
      profile: { accountLabel: 'patient@example.com' },
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
  it('keeps the guest-booking confirmation visible after clearing the reference', async () => {
    const { fixture } = await createFixture({ signedIn: true });
    fixture.componentInstance.claimForm.reset();
    fixture.componentInstance.claimMessage.set('Appointment linked to your account.');
    fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('#claim-booking-ref').closest('details') as HTMLDetailsElement).open).toBeTrue();
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
    const radios = Array.from(
      fixture.nativeElement.querySelectorAll('input[type="radio"][formControlName="time"]') as NodeListOf<HTMLInputElement>,
    );
    expect(radios.length).toBe(2);
    radios[0].click();
    expect(fixture.componentInstance.rescheduleForm.controls.time.value).toBe('11:30');
    radios[1].click();
    expect(fixture.componentInstance.rescheduleForm.controls.time.value).toBe('12:00');
  });

  it('shows an availability failure beside the picker and allows a retry without claiming the day is full', async () => {
    const { fixture, api } = await createFixture({ signedIn: true });
    const component = fixture.componentInstance;
    component.appointments.set([appointmentSummary()]);
    api.availability.and.rejectWith(new Error('Could not load times.'));
    await component.openReschedule(appointmentSummary());
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Could not load times.');
    expect(fixture.nativeElement.textContent).not.toContain('No open times');
    await component.saveReschedule();
    expect(api.reschedule).not.toHaveBeenCalled();
    api.availability.and.resolveTo(['11:30']);
    await component.loadRescheduleAvailability();
    expect(component.rescheduleAvailabilityError()).toBeNull();
    expect(component.rescheduleSlots()).toEqual(['11:30']);
  });

  it('ignores old availability responses and prevents submitting a stale selected time', async () => {
    const { fixture, api } = await createFixture({ signedIn: true });
    const component = fixture.componentInstance;
    let resolveOld!: (slots: string[]) => void;
    api.availability.and.returnValue(new Promise(resolve => { resolveOld = resolve; }));
    const oldRequest = component.openReschedule(appointmentSummary());
    component.rescheduleForm.controls.time.setValue('11:30');
    await component.saveReschedule();
    expect(api.reschedule).not.toHaveBeenCalled();
    api.availability.and.resolveTo(['12:00']);
    component.rescheduleForm.controls.date.setValue('2099-10-02');
    await component.loadRescheduleAvailability();
    resolveOld(['11:30']);
    await oldRequest;
    expect(component.rescheduleSlots()).toEqual(['12:00']);
    component.rescheduleForm.controls.time.setValue('11:30');
    await component.saveReschedule();
    expect(api.reschedule).not.toHaveBeenCalled();
  });

  it('preserves the selected time after a save failure and closes only after a successful retry', async () => {
    const { fixture, api } = await createFixture({ signedIn: true });
    const component = fixture.componentInstance;
    api.availability.and.resolveTo(['11:30']);
    await component.openReschedule(appointmentSummary());
    component.rescheduleForm.controls.time.setValue('11:30');
    api.reschedule.and.rejectWith(new Error('Please try again.'));
    await component.saveReschedule();
    expect(component.rescheduleSaveError()).toBe('Please try again.');
    expect(component.rescheduleForm.controls.time.value).toBe('11:30');
    expect(component.rescheduleId()).toBe('appointment-1');
    api.reschedule.and.resolveTo({ ...appointmentSummary(), time: '11:30', status: 'pending' });
    await component.saveReschedule();
    expect(component.rescheduleId()).toBeNull();
    expect(component.appointments()[0].status).toBe('pending');
  });

  it('submits a review only for a completed appointment and shows moderation state', async () => {
    const { fixture, api } = await createFixture({ signedIn: true });
    const appointment = { ...appointmentSummary(), status: 'completed' };
    api.submitReview.and.resolveTo({
      id: 'review-1', rating: 5, text: 'Thoughtful care.', patientAlias: 'Riya',
      moderationStatus: 'pending', clinicResponse: '', createdAt: null,
      publishedAt: null, clinicRespondedAt: null,
    });
    fixture.componentInstance.appointments.set([appointment]);
    fixture.componentInstance.openReview(appointment.id);
    fixture.componentInstance.reviewForm.patchValue({ text: 'Thoughtful care.', anonymous: true });

    await fixture.componentInstance.submitReview(appointment.id);
    fixture.detectChanges();

    expect(api.submitReview).toHaveBeenCalledWith(appointment.id, 5, 'Thoughtful care.', true);
    expect(fixture.nativeElement.textContent).toContain('Awaiting moderation');
    expect(fixture.nativeElement.textContent).not.toContain('Review visit');
  });
});
