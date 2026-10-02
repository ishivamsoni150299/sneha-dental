import { signal } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SeoService } from '../../core/services/seo.service';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { DEFAULT_SCHEDULE, DoctorService } from '../../core/services/doctor.service';
import type { MarketplaceClinic } from '../../core/services/marketplace.service';
import { MarketplaceService } from '../../core/services/marketplace.service';
import { PatientAppointmentApiService } from '../../core/services/patient-appointment-api.service';
import { PatientAuthService } from '../../core/services/patient-auth.service';
import { DentistProfileComponent } from './dentist-profile.component';

function verifiedClinic(acceptingNewPatients = true): MarketplaceClinic {
  return {
    id: 'clinic-1',
    clinicId: 'clinic-1',
    name: 'Smile Care Dental',
    doctorName: 'Dr. Asha Verma',
    doctorQualification: 'BDS, MDS',
    doctorBio: [],
    patientCount: '500+',
    rating: '',
    phone: '+91 90000 00000',
    phoneE164: '919000000000',
    whatsappNumber: '919000000000',
    addressLine1: 'Sector 18',
    addressLine2: '',
    city: 'Noida',
    mapEmbedUrl: '',
    mapDirectionsUrl: 'https://maps.example/smile-care',
    active: true,
    marketplaceStatus: 'verified',
    marketplaceSlug: 'smile-care-noida',
    marketplaceVerifiedDoctorIds: ['doctor-1'],
    marketplaceProfile: {
      region: 'delhi-ncr',
      locality: 'Sector 18, Noida',
      serviceIds: ['root-canal', 'dental-implants'],
      languages: ['Hindi', 'English'],
      consultationFee: 500,
      paymentMethods: ['cash', 'upi'],
      acceptingNewPatients,
      listingImageUrl: 'https://images.example/clinic.jpg',
    },
    subscriptionPlan: 'trial',
    subscriptionStatus: 'trial',
    hostedDomain: 'smilecare.mydentalplatform.com',
    theme: 'blue',
    bookingRefPrefix: 'SC',
    social: {},
    hours: [{ days: 'Monday - Saturday', time: '9:00 AM - 7:00 PM' }],
    services: [],
    plans: [],
    testimonials: [],
  };
}

async function renderProfile(acceptingNewPatients = true, dentist = false) {
  const clinic = verifiedClinic(acceptingNewPatients);
  if (dentist) {
    clinic.profileEntity = 'dentist'; clinic.name = clinic.doctorName;
    clinic.bookingSlug = 'smile-care-noida'; clinic.marketplaceSlug = 'asha-verma';
    clinic.practiceLocations = [{ id: 'location-1', name: 'Smile Care Dental', clinicSlug: 'smile-care-noida', city: 'Noida', locality: 'Sector 18', addressLine1: 'Main Road', consultationFee: 500, acceptingNewPatients, schedule: {} }];
  }
  const marketplace = jasmine.createSpyObj<MarketplaceService>('MarketplaceService', [
    'getVerifiedClinicBySlug',
    'getVerifiedProviderBySlug', 'getPublicClinicDentists',
    'getPublishedReviews',
    'serviceLabel',
    'listingImage',
    'hasListingPhoto',
    'clinicWebsiteUrl',
  ]);
  marketplace.getVerifiedClinicBySlug.and.resolveTo(clinic);
  marketplace.getVerifiedProviderBySlug.and.resolveTo(clinic);
  marketplace.getPublicClinicDentists.and.resolveTo([]);
  const params = new BehaviorSubject(convertToParamMap({ slug: dentist ? 'asha-verma' : 'smile-care-noida' }));
  const seo = jasmine.createSpyObj<SeoService>('SeoService', ['setPublicProfile', 'publicProfileUnavailable']);
  marketplace.getPublishedReviews.and.resolveTo([{
    id: 'review-1', clinicId: clinic.id, rating: 5, text: 'Clear and gentle care.',
    patientAlias: 'Riya S.', publishedAt: '2026-08-15T10:00:00.000Z',
    clinicResponse: 'Thank you for visiting.', clinicRespondedAt: '2026-08-16T10:00:00.000Z',
  }]);
  marketplace.serviceLabel.and.callFake(id => id === 'root-canal' ? 'Root Canal Treatment' : 'Dental Implants');
  marketplace.listingImage.and.returnValue('https://images.example/clinic.jpg');
  marketplace.hasListingPhoto.and.returnValue(true);
  marketplace.clinicWebsiteUrl.and.returnValue('https://smilecare.mydentalplatform.com');

  const doctors = jasmine.createSpyObj<DoctorService>('DoctorService', ['getDoctors']);
  doctors.getDoctors.and.resolveTo([
    {
      id: 'doctor-1',
      name: 'Dr. Rohan Mehta',
      qualification: 'BDS',
      speciality: 'Endodontics',
      available: true,
      schedule: DEFAULT_SCHEDULE,
    },
    {
      id: 'doctor-2',
      name: 'Dr. Unverified Example',
      qualification: 'BDS',
      speciality: 'Dentistry',
      available: true,
      schedule: DEFAULT_SCHEDULE,
    },
  ]);
  const patientApi = jasmine.createSpyObj<PatientAppointmentApiService>('PatientAppointmentApiService', ['reportReview']);
  patientApi.reportReview.and.resolveTo();
  const patientAuth = { isSignedIn: signal(true), role: signal('patient') };

  await TestBed.configureTestingModule({
    imports: [DentistProfileComponent],
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { paramMap: params, snapshot: { parent: { routeConfig: { path: dentist ? 'dentist' : 'clinic' } } } },
      },
      { provide: MarketplaceService, useValue: marketplace },
      { provide: DoctorService, useValue: doctors },
      { provide: PatientAppointmentApiService, useValue: patientApi },
      { provide: PatientAuthService, useValue: patientAuth },
      { provide: SeoService, useValue: seo },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(DentistProfileComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, marketplace, patientApi, seo, doctors, params };
}

describe('DentistProfileComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders public verified details and only explicitly verified additional doctors', async () => {
    const { fixture, marketplace } = await renderProfile();
    const text = fixture.nativeElement.textContent as string;

    expect(marketplace.getVerifiedClinicBySlug).toHaveBeenCalledWith('smile-care-noida', false);
    expect(text).toContain('Smile Care Dental');
    expect(text).toContain('Dr. Asha Verma');
    expect(text).toContain('Dr. Rohan Mehta');
    expect(text).not.toContain('Dr. Unverified Example');
    expect(text).toContain('Root Canal Treatment');
    expect(text).toContain('₹500');
    expect(text).toContain('5.0');
    expect(text).toContain('Clear and gentle care.');
    expect(text).toContain('Thank you for visiting.');
    const bookingLinks = Array.from(fixture.nativeElement.querySelectorAll('a')) as HTMLAnchorElement[];
    expect(bookingLinks.some(link =>
      link.textContent?.includes('Request appointment') && link.getAttribute('href') === '/dentists/smile-care-noida/book'
    )).toBeTrue();
  });

  it('does not offer appointment requests when the clinic has paused new-patient intake', async () => {
    const { fixture } = await renderProfile(false);
    const links = Array.from(fixture.nativeElement.querySelectorAll('a')) as HTMLAnchorElement[];

    expect(links.some(link => link.textContent?.includes('Request appointment'))).toBeFalse();
    expect(fixture.nativeElement.textContent).toContain('Call first');
  });

  it('retains affiliated dentist identity and links to the clinic without borrowing clinic reviews', async () => {
    const { fixture, marketplace, doctors, seo } = await renderProfile(true, true);
    expect(fixture.nativeElement.querySelector('h1').textContent).toContain('Dr. Asha Verma');
    expect(fixture.nativeElement.textContent).toContain('Verified Dentist');
    expect(fixture.nativeElement.querySelector('a[href="/clinic/smile-care-noida"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('a[href="/dentists/smile-care-noida/book"]')).not.toBeNull();
    expect(marketplace.getPublishedReviews).not.toHaveBeenCalled();
    expect(doctors.getDoctors).not.toHaveBeenCalled();
    expect(seo.setPublicProfile).toHaveBeenCalled();
  });

  it('clears the previous profile and metadata on same-route navigation to a missing dentist', async () => {
    const { fixture, marketplace, seo, params } = await renderProfile(true, true);
    marketplace.getVerifiedProviderBySlug.and.resolveTo(null);
    params.next(convertToParamMap({ slug: 'missing' }));
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Profile not found');
    expect(fixture.nativeElement.textContent).not.toContain('Dr. Asha Verma');
    expect(seo.publicProfileUnavailable).toHaveBeenCalled();
  });

  it('submits a review report from a verified patient session', async () => {
    const { fixture, patientApi } = await renderProfile();
    fixture.componentInstance.openReport('review-1');
    fixture.componentInstance.reportForm.patchValue({ reason: 'privacy', details: 'Contains a name.' });

    await fixture.componentInstance.submitReport('review-1');
    fixture.detectChanges();

    expect(patientApi.reportReview).toHaveBeenCalledWith('review-1', 'privacy', 'Contains a name.');
    expect(fixture.nativeElement.textContent).toContain('platform team will review');
  });
});
