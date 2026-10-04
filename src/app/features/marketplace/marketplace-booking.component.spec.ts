import { By } from '@angular/platform-browser';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { DEFAULT_SCHEDULE, DoctorService } from '../../core/services/doctor.service';
import type { MarketplaceClinic } from '../../core/services/marketplace.service';
import { MarketplaceService } from '../../core/services/marketplace.service';
import { AppointmentComponent } from '../appointment/appointment.component';
import { MarketplaceBookingComponent } from './marketplace-booking.component';
import { PatientAuthService } from '../../core/services/patient-auth.service';
import { AppointmentService } from '../../core/services/appointment.service';
import { AuthFacade } from '../../core/services/auth-facade.service';

function clinic(): MarketplaceClinic {
  return {
    id: 'clinic-1', clinicId: 'clinic-1', name: 'Smile Care Dental', doctorName: 'Dr. Asha',
    doctorBio: [], patientCount: '500+', rating: '', phone: '+91 90000 00000',
    phoneE164: '919000000000', whatsappNumber: '919000000000', addressLine1: 'Sector 18',
    addressLine2: '', city: 'Noida', mapEmbedUrl: '', mapDirectionsUrl: '', active: true,
    marketplaceStatus: 'verified', marketplaceSlug: 'smile-care-noida',
    marketplaceVerifiedDoctorIds: ['doctor-1'], marketplaceProfile: {
      region: 'delhi-ncr', locality: 'Sector 18, Noida', serviceIds: ['root-canal'],
      languages: ['Hindi'], paymentMethods: ['upi'], acceptingNewPatients: true,
    }, theme: 'blue', bookingRefPrefix: 'SC', social: {},
    hours: [{ days: 'Monday - Saturday', time: '9:00 AM - 7:00 PM' }],
    services: [], plans: [], testimonials: [],
  };
}

describe('MarketplaceBookingComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: AuthFacade, useValue: {
      authReady: Promise.resolve(), role: signal(null), currentUser: signal(null),
    } }] });
  });

  async function createStateFixture(result: MarketplaceClinic | null, videoReady = false, mode = '', signedIn = false, query: Record<string, string> = {}) {
    const marketplace = jasmine.createSpyObj<MarketplaceService>('MarketplaceService', [
      'getVerifiedClinicBySlug', 'serviceLabel', 'videoAvailable', 'getAvailability',
    ]);
    marketplace.getVerifiedClinicBySlug.and.resolveTo(result);
    marketplace.videoAvailable.and.resolveTo(videoReady);
    const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    marketplace.getAvailability.and.resolveTo({ dentistSlug: 'missing-clinic', timezone: 'Asia/Kolkata', days: [{
      date, slots: [{ doctorId: result?.isIndependent ? result.id : 'doctor-1', doctorName: 'Dr. Asha', time: '10:00:00', startsAt: `${date}T10:00:00+05:30` }],
    }] });
    const doctors = jasmine.createSpyObj<DoctorService>('DoctorService', ['getDoctors']);
    doctors.getDoctors.and.resolveTo([{ id: 'doctor-1', name: 'Dr. Asha', available: true, qualification: 'BDS', speciality: '', schedule: DEFAULT_SCHEDULE }]);
    await TestBed.configureTestingModule({
      imports: [MarketplaceBookingComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ slug: 'missing-clinic' }),
              queryParamMap: convertToParamMap({ mode, ...query }),
            },
          },
        },
        { provide: MarketplaceService, useValue: marketplace },
        { provide: DoctorService, useValue: doctors },
        { provide: PatientAuthService, useValue: { ready: Promise.resolve(), isSignedIn: () => signedIn, user: () => null, matchingPatientUid: () => null, role: () => signedIn ? 'patient' : null } },
        { provide: AppointmentService, useValue: { holdSlot: async () => ({ holdToken: 'test-hold', expiresAt: `${date}T10:00:00Z` }), releaseHold: async () => undefined, bookAppointment: jasmine.createSpy('bookAppointment').and.resolveTo('TEST-REQUEST') } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(MarketplaceBookingComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('distinguishes an unknown profile from a clinic that paused requests', async () => {
    const fixture = await createStateFixture(null);
    expect(fixture.nativeElement.textContent).toContain('Dentist not found');
    expect(fixture.nativeElement.textContent).not.toContain('Online requests are paused');
  });

  it('shows a paused state for a clinic that is not accepting new patients', async () => {
    const pausedClinic = clinic();
    pausedClinic.marketplaceProfile = {
      ...pausedClinic.marketplaceProfile!,
      acceptingNewPatients: false,
    };
    const fixture = await createStateFixture(pausedClinic);
    expect(fixture.nativeElement.textContent).toContain('Online requests are paused');
    expect(fixture.nativeElement.textContent).not.toContain('Dentist not found');
  });

  it('builds explicit context with only verified available doctors', async () => {
    const marketplace = jasmine.createSpyObj<MarketplaceService>('MarketplaceService', [
      'getVerifiedClinicBySlug', 'serviceLabel',
    ]);
    marketplace.getVerifiedClinicBySlug.and.resolveTo(clinic());
    marketplace.serviceLabel.and.returnValue('Root Canal Treatment');
    const doctors = jasmine.createSpyObj<DoctorService>('DoctorService', ['getDoctors']);
    doctors.getDoctors.and.resolveTo([
      { id: 'doctor-1', name: 'Dr. Verified', qualification: 'BDS', speciality: '', available: true, schedule: DEFAULT_SCHEDULE },
      { id: 'doctor-2', name: 'Dr. Unverified', qualification: 'BDS', speciality: '', available: true, schedule: DEFAULT_SCHEDULE },
    ]);

    await TestBed.configureTestingModule({
      imports: [MarketplaceBookingComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ slug: 'smile-care-noida' }),
              queryParamMap: convertToParamMap({}),
            },
          },
        },
        { provide: MarketplaceService, useValue: marketplace },
        { provide: DoctorService, useValue: doctors },
        { provide: PatientAuthService, useValue: { ready: Promise.resolve(), isSignedIn: () => false, user: () => null } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(MarketplaceBookingComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    fixture.componentInstance.onSlotSelected({
      doctorId: 'doctor-1',
      doctorName: 'Dr. Verified',
      date: '2026-09-07',
      time: '10:00',
    });
    fixture.detectChanges();

    const form = fixture.debugElement.query(By.directive(AppointmentComponent)).componentInstance as AppointmentComponent;
    expect(form.bookingContext?.clinicId).toBe('clinic-1');
    expect(form.bookingContext?.source).toBe('marketplace');
    expect(form.bookingContext?.services).toEqual([{ name: 'Root Canal Treatment', price: undefined }]);
    expect(form.bookingContext?.doctors.map(doctor => doctor.id)).toEqual(['doctor-1']);
  });

  it('shows a pending receipt without claiming the request is confirmed', async () => {
    const marketplace = jasmine.createSpyObj<MarketplaceService>('MarketplaceService', [
      'getVerifiedClinicBySlug', 'serviceLabel',
    ]);
    marketplace.getVerifiedClinicBySlug.and.resolveTo(clinic());
    marketplace.serviceLabel.and.returnValue('Root Canal Treatment');
    const doctors = jasmine.createSpyObj<DoctorService>('DoctorService', ['getDoctors']);
    doctors.getDoctors.and.resolveTo([]);
    await TestBed.configureTestingModule({
      imports: [MarketplaceBookingComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ slug: 'smile-care-noida' }),
              queryParamMap: convertToParamMap({}),
            },
          },
        },
        { provide: MarketplaceService, useValue: marketplace },
        { provide: DoctorService, useValue: doctors },
        { provide: PatientAuthService, useValue: { ready: Promise.resolve(), isSignedIn: () => false, user: () => null } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(MarketplaceBookingComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.onBooked({
      ref: 'SC-ABCDEFGH', name: 'Patient', date: '2026-09-10', time: '10:00', service: 'Consultation',
    });
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Pending clinic confirmation');
    expect(text).toContain('Your request was sent');
    expect(text).not.toContain('Booking confirmed');
  });

  it('moves focus between time selection and details without losing entered information', async () => {
    const fixture = await createStateFixture(clinic());
    fixture.componentInstance.onSlotSelected({ doctorId: 'doctor-1', doctorName: 'Dr. Asha',
      date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), time: '10:00' });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement?.id).toBe('quick-booking-title');
    const form = fixture.debugElement.query(By.directive(AppointmentComponent)).componentInstance as AppointmentComponent;
    form.form.controls.name.setValue('Preview Patient');

    fixture.componentInstance.setEditingTime(true);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement?.id).toBe('booking-time-title');

    fixture.componentInstance.setEditingTime(false);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement?.id).toBe('quick-booking-title');
    expect(form.form.controls.name.value).toBe('Preview Patient');
  });

  it('preserves a video booking link and limits the form to the video service', async () => {
    const provider = clinic();
    provider.marketplaceProfile!.videoConsultationEnabled = true;
    provider.marketplaceProfile!.videoConsultationFee = 400;
    const fixture = await createStateFixture(provider, true, 'video');
    expect(fixture.componentInstance.consultationMode()).toBe('video');
    expect(fixture.componentInstance.selectedContext()?.services).toEqual([{ name: 'Video Consultation', price: '₹400' }]);
    fixture.componentInstance.onSlotSelected({ doctorId:'doctor-1', doctorName:'Doctor', date:'2026-12-01', time:'10:00' });
    fixture.componentInstance.chooseMode('in_person');
    expect(fixture.componentInstance.selectedSlot()).toBeNull();
    expect(fixture.componentInstance.selectedContext()?.consultationMode).toBe('in_person');
  });

  it('does not silently change an unavailable video request into an in-person booking', async () => {
    const fixture = await createStateFixture(clinic(), false, 'video');
    expect(fixture.componentInstance.videoUnavailable()).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('Video consultations are unavailable');
    expect(fixture.nativeElement.querySelector('app-slot-picker')).toBeNull();
    fixture.componentInstance.chooseMode('in_person'); fixture.detectChanges();
    expect(fixture.componentInstance.videoUnavailable()).toBeFalse();
  });

  it('does not offer independent video booking when the provider is unavailable', async () => {
    const provider = clinic();
    provider.isIndependent = true;
    provider.marketplaceProfile!.videoConsultationEnabled = true;
    const fixture = await createStateFixture(provider, false);
    expect(fixture.componentInstance.consultationMode()).toBe('video');
    expect(fixture.componentInstance.videoUnavailable()).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('Video consultations are unavailable');
    expect(fixture.nativeElement.querySelector('app-slot-picker')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('In-clinic visit');
  });

  it('lets an independent video patient select a real API slot and continue to details', async () => {
    const provider = clinic();
    provider.isIndependent = true;
    provider.providerSchedule = {};
    provider.marketplaceProfile!.videoConsultationEnabled = true;
    const fixture = await createStateFixture(provider, true, 'video', true);
    const picker = fixture.nativeElement.querySelector('app-slot-picker');
    expect(picker).not.toBeNull();
    const slot = Array.from(picker.querySelectorAll('button')).find(button => (button as HTMLButtonElement).textContent?.includes('10:00 AM')) as HTMLButtonElement;
    expect(slot).toBeDefined();
    slot.click(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const form = fixture.debugElement.query(By.directive(AppointmentComponent)).componentInstance as AppointmentComponent;
    expect(form.form.value.time).toBe('10:00');
    expect(form.form.value.service).toBe('Video Consultation');
    expect(form.currentStep()).toBe(2);
    expect(form.bookingContext?.isIndependent).toBeTrue();
    expect(fixture.nativeElement.textContent).not.toContain('Independent Dentist Profile:');
    expect(fixture.nativeElement.querySelector('#booking-time-picker').hidden).toBeTrue();
    expect(fixture.nativeElement.textContent).not.toContain('Step 2 of 3');
    expect(fixture.nativeElement.querySelector('[aria-label="Video consultation summary"]')).toBeNull();

    form.form.patchValue({ name: 'Saved patient', phone: '9876543210' });
    form.prevStep(); fixture.detectChanges();
    expect(fixture.componentInstance.editingTime()).toBeTrue();
    expect(fixture.nativeElement.querySelector('#booking-time-picker').hidden).toBeFalse();
    expect(fixture.nativeElement.querySelector('app-appointment').hidden).toBeTrue();
    expect(form.currentStep()).toBe(2);
    fixture.componentInstance.editingTime.set(false); fixture.detectChanges();
    expect(fixture.debugElement.query(By.directive(AppointmentComponent)).componentInstance).toBe(form);
    expect(form.form.value.name).toBe('Saved patient');
    expect(form.form.value.phone).toBe('9876543210');
    expect(fixture.nativeElement.querySelector('.booking-mobile-selection')).toBeNull();
    form.currentStep.set(3); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.booking-mobile-promises')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Response in 2 working hrs');
    expect(fixture.nativeElement.querySelector('#appointment-privacyAccepted')).not.toBeNull();
  });

  it('keeps the selected video slot while showing patient sign-in on the same page', async () => {
    const provider = clinic(); provider.isIndependent = true;
    const fixture = await createStateFixture(provider, true, 'video');
    fixture.componentInstance.onSlotSelected({ doctorId: provider.id, doctorName: 'Dr. Asha', date: '2026-12-01', time: '10:00:00' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Sign in to continue');
    expect(fixture.nativeElement.querySelector('a[href^="/account"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-appointment')).toBeNull();
    expect(fixture.componentInstance.selectedSlot()?.time).toBe('10:00:00');
    expect(fixture.nativeElement.querySelector('#booking-time-picker').hidden).toBeTrue();
    const changeTime = Array.from(fixture.nativeElement.querySelectorAll('button')).find(button => (button as HTMLButtonElement).textContent?.trim() === 'Change time') as HTMLButtonElement;
    changeTime.click(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#booking-time-picker').hidden).toBeFalse();
    expect(fixture.nativeElement.querySelector('[aria-labelledby="video-signin-heading"]').hidden).toBeTrue();
  });

  it('shows a concise video receipt with one next action and no confirmation promise', async () => {
    const provider = clinic(); provider.isIndependent = true;
    const fixture = await createStateFixture(provider, true, 'video', true);
    fixture.componentInstance.onBooked({ consultationMode: 'video', ref: 'TEST-123', name: 'Patient', date: '2030-01-10', time: '10:00 AM', service: 'Video Consultation' });
    fixture.detectChanges();
    const receipt = fixture.nativeElement.querySelector('.video-receipt');
    expect(receipt.textContent).toContain('Pending dentist confirmation');
    expect(receipt.textContent).toContain('10 minutes before your call');
    expect(receipt.querySelectorAll('a').length).toBe(1);
    expect(receipt.textContent).not.toContain('two working hours');
  });

  it('lets a patient choose a time and submit details directly without a review screen', async () => {
    const fixture = await createStateFixture(clinic());
    const slot = fixture.nativeElement.querySelector('button[aria-label="10:00 AM · Dr. Asha"]') as HTMLButtonElement;
    slot.click(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const form = fixture.debugElement.query(By.directive(AppointmentComponent)).componentInstance as AppointmentComponent;
    expect(fixture.nativeElement.querySelector('#booking-time-picker').hidden).toBeTrue();
    expect(fixture.nativeElement.textContent).not.toContain('Review appointment');
    expect(fixture.nativeElement.querySelector('[aria-label="Booking progress"]')).toBeNull();
    form.form.patchValue({ name: 'Test Patient', phone: '9876543210' });
    spyOn(form.mobileVerification()!, 'canSubmit').and.returnValue(true);
    await form.onSubmit();
    expect(TestBed.inject(AppointmentService).bookAppointment).not.toHaveBeenCalled();
    form.form.patchValue({ privacyAccepted: true });
    await form.onSubmit(); fixture.detectChanges();
    expect(TestBed.inject(AppointmentService).bookAppointment).toHaveBeenCalledWith(
      jasmine.objectContaining({ name: 'Test Patient', phone: '9876543210', service: 'Other / Not Sure', doctorId: 'doctor-1', time: '10:00' }),
      jasmine.objectContaining({ source: 'marketplace' }), 'test-hold', undefined,
    );
    expect(fixture.nativeElement.textContent).toContain('Your request was sent');
    expect(fixture.nativeElement.textContent).toContain('Pending clinic confirmation');
  });

  it('retains entered details when changing an in-clinic time', async () => {
    const fixture = await createStateFixture(clinic());
    fixture.nativeElement.querySelector('button[aria-label="10:00 AM · Dr. Asha"]').click();
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const form = fixture.debugElement.query(By.directive(AppointmentComponent)).componentInstance as AppointmentComponent;
    form.form.patchValue({ name: 'Saved Patient', phone: '9876543210' });
    const change = Array.from(fixture.nativeElement.querySelectorAll('button')).find(button => (button as HTMLButtonElement).textContent?.trim() === 'Change time') as HTMLButtonElement;
    change.click(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-appointment').hidden).toBeTrue();
    fixture.componentInstance.editingTime.set(false); fixture.detectChanges();
    expect(form.form.value.name).toBe('Saved Patient'); expect(form.form.value.phone).toBe('9876543210');
  });

  it('honours a directory slot link after validating availability in India time', async () => {
    const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const fixture = await createStateFixture(clinic(), false, '', false, { doctorId: 'doctor-1', startsAt: `${date}T04:30:00Z` });
    expect(fixture.componentInstance.selectedSlot()?.time).toBe('10:00:00');
    expect(fixture.nativeElement.querySelector('#booking-time-picker').hidden).toBeTrue();
    expect(fixture.nativeElement.querySelector('#appointment-name')).not.toBeNull();
  });

  it('releases a late hold rather than overwriting the current time reservation', async () => {
    const fixture = await createStateFixture(clinic());
    const service = TestBed.inject(AppointmentService);
    let completeOld!: (value: { holdToken: string; expiresAt: string }) => void;
    let firstStarted!: () => void, secondStarted!: () => void;
    const first = new Promise<void>(resolve => { firstStarted = resolve; });
    const second = new Promise<void>(resolve => { secondStarted = resolve; });
    const oldHold = new Promise<{ holdToken: string; expiresAt: string }>(resolve => { completeOld = resolve; });
    let calls = 0;
    spyOn(service, 'holdSlot').and.callFake(async () => {
      if (++calls === 1) { firstStarted(); return oldHold; }
      secondStarted(); return { holdToken: 'current-hold', expiresAt: '2030-01-01T00:00:00Z' };
    });
    const release = spyOn(service, 'releaseHold').and.resolveTo();
    fixture.nativeElement.querySelector('button[aria-label="10:00 AM · Dr. Asha"]').click(); fixture.detectChanges();
    await first;
    fixture.componentInstance.onSlotSelected({ ...fixture.componentInstance.selectedSlot()! }); fixture.detectChanges();
    await second;
    completeOld({ holdToken: 'stale-hold', expiresAt: '2030-01-01T00:00:00Z' });
    await fixture.whenStable(); fixture.detectChanges();
    const form = fixture.debugElement.query(By.directive(AppointmentComponent)).componentInstance as AppointmentComponent;
    expect(form.holdToken()).toBe('current-hold'); expect(release).toHaveBeenCalledWith('stale-hold');
  });

  it('offers recovery when a displayed slot disappears before it can be reserved', async () => {
    const fixture = await createStateFixture(clinic());
    const marketplace = TestBed.inject(MarketplaceService) as jasmine.SpyObj<MarketplaceService>;
    marketplace.getAvailability.and.resolveTo({ dentistSlug: 'missing-clinic', timezone: 'Asia/Kolkata', days: [] });
    fixture.nativeElement.querySelector('button[aria-label="10:00 AM · Dr. Asha"]').click();
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('This time is no longer available');
    expect(fixture.nativeElement.textContent).toContain('Choose another time');
    expect(TestBed.inject(AppointmentService).bookAppointment).not.toHaveBeenCalled();
  });
});
