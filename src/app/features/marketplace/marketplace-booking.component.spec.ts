import { By } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { DEFAULT_SCHEDULE, DoctorService } from '../../core/services/doctor.service';
import type { MarketplaceClinic } from '../../core/services/marketplace.service';
import { MarketplaceService } from '../../core/services/marketplace.service';
import { AppointmentComponent } from '../appointment/appointment.component';
import { MarketplaceBookingComponent } from './marketplace-booking.component';

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
  async function createStateFixture(result: MarketplaceClinic | null) {
    const marketplace = jasmine.createSpyObj<MarketplaceService>('MarketplaceService', [
      'getVerifiedClinicBySlug', 'serviceLabel',
    ]);
    marketplace.getVerifiedClinicBySlug.and.resolveTo(result);
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
              paramMap: convertToParamMap({ slug: 'missing-clinic' }),
              queryParamMap: convertToParamMap({}),
            },
          },
        },
        { provide: MarketplaceService, useValue: marketplace },
        { provide: DoctorService, useValue: doctors },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(MarketplaceBookingComponent);
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
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(MarketplaceBookingComponent);
    fixture.detectChanges();
    await fixture.whenStable();
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
});