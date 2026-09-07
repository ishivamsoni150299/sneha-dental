import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { DentistDirectoryComponent } from './dentist-directory.component';
import { MarketplaceService, type MarketplaceClinic } from '../../core/services/marketplace.service';

function createMockClinic(overrides: Partial<MarketplaceClinic> = {}): MarketplaceClinic {
  return {
    id: 'clinic-noida-1',
    clinicId: 'clinic-noida-1',
    name: 'Smile Perfect Dental',
    doctorName: 'Dr. Neha Gupta',
    doctorQualification: 'BDS, MDS - Endodontics',
    doctorBio: [],
    patientCount: '1200+',
    rating: '4.9',
    phone: '+91 98765 43210',
    phoneE164: '919876543210',
    whatsappNumber: '919876543210',
    addressLine1: 'Sector 18 Market',
    addressLine2: '',
    city: 'Noida',
    mapEmbedUrl: '',
    mapDirectionsUrl: 'https://maps.example/smile-perfect',
    active: true,
    marketplaceStatus: 'verified',
    marketplaceSlug: 'smile-perfect-noida',
    marketplaceVerifiedDoctorIds: ['doc-1'],
    marketplaceProfile: {
      region: 'delhi-ncr',
      locality: 'Sector 18, Noida',
      serviceIds: ['root-canal', 'dental-implants', 'cleaning-scaling', 'teeth-whitening'],
      languages: ['Hindi', 'English'],
      consultationFee: 500,
      experienceYears: 12,
      gender: 'female',
      paymentMethods: ['cash', 'upi', 'card'],
      acceptingNewPatients: true,
      listingImageUrl: 'https://images.example/clinic1.jpg',
      latitude: 28.57,
      longitude: 77.32,
    },
    subscriptionPlan: 'pro',
    subscriptionStatus: 'active',
    hostedDomain: 'smileperfect.mydentalplatform.com',
    theme: 'blue',
    bookingRefPrefix: 'SP',
    social: {},
    hours: [{ days: 'Monday - Saturday', time: '10:00 AM - 8:00 PM' }],
    services: [],
    plans: [],
    testimonials: [],
    ...overrides,
  };
}

function createDelhiClinic(): MarketplaceClinic {
  return createMockClinic({
    id: 'clinic-delhi-1',
    clinicId: 'clinic-delhi-1',
    name: 'Apex Dental Care',
    doctorName: 'Dr. Rajesh Khanna',
    doctorQualification: 'BDS, MDS - Orthodontics',
    city: 'Delhi',
    marketplaceSlug: 'apex-dental-delhi',
    marketplaceProfile: {
      region: 'delhi-ncr',
      locality: 'South Extension, Delhi',
      serviceIds: ['braces-orthodontics', 'clear-aligners', 'emergency-dental-care'],
      languages: ['Hindi', 'English', 'Punjabi'],
      consultationFee: 800,
      experienceYears: 16,
      gender: 'male',
      paymentMethods: ['cash', 'upi', 'card'],
      acceptingNewPatients: true,
      listingImageUrl: null,
      latitude: 28.57,
      longitude: 77.22,
    },
  });
}

describe('DentistDirectoryComponent', () => {
  let marketplaceSpy: jasmine.SpyObj<MarketplaceService>;

  beforeEach(() => {
    marketplaceSpy = jasmine.createSpyObj<MarketplaceService>('MarketplaceService', [
      'getVerifiedClinics',
      'getPublishedReviews',
      'getAvailability',
      'serviceLabel',
      'listingImage',
      'hasListingPhoto',
      'clinicWebsiteUrl',
    ]);

    marketplaceSpy.getVerifiedClinics.and.resolveTo({
      dentists: [createMockClinic(), createDelhiClinic()],
      totalCount: 2,
      limit: 50,
      offset: 0,
    });
    marketplaceSpy.getPublishedReviews.and.resolveTo([
      {
        id: 'rev-1',
        clinicId: 'clinic-noida-1',
        rating: 5,
        text: 'Very gentle root canal treatment.',
        patientAlias: 'Ankit M.',
        publishedAt: '2026-08-01T10:00:00Z',
        clinicResponse: 'Thank you Ankit!',
        clinicRespondedAt: '2026-08-02T10:00:00Z',
      },
    ]);
    marketplaceSpy.getAvailability.and.resolveTo({
      dentistSlug: 'smile-perfect-noida',
      timezone: 'Asia/Kolkata',
      days: [
        {
          date: '2026-09-06',
          slots: [
            {
              doctorId: 'doc-1',
              doctorName: 'Dr. Neha Gupta',
              time: '11:00 AM',
              startsAt: '2026-09-06T11:00:00+05:30',
            },
            {
              doctorId: 'doc-1',
              doctorName: 'Dr. Neha Gupta',
              time: '02:30 PM',
              startsAt: '2026-09-06T14:30:00+05:30',
            },
          ],
        },
      ],
    });
    marketplaceSpy.serviceLabel.and.callFake((id: string) => {
      const map: Record<string, string> = {
        'root-canal': 'Root Canal Treatment',
        'dental-implants': 'Dental Implants',
        'cleaning-scaling': 'Cleaning & Scaling',
        'teeth-whitening': 'Teeth Whitening',
        'braces-orthodontics': 'Braces & Orthodontics',
        'clear-aligners': 'Clear Aligners',
        'emergency-dental-care': 'Emergency Dental Care',
      };
      return map[id] || id;
    });
    marketplaceSpy.listingImage.and.returnValue('https://images.example/clinic1.jpg');
    marketplaceSpy.hasListingPhoto.and.callFake((c: MarketplaceClinic) => Boolean(c.marketplaceProfile?.listingImageUrl));
  });

  afterEach(() => TestBed.resetTestingModule());

  async function setupComponent(initialData: Record<string, unknown> = {}) {
    await TestBed.configureTestingModule({
      imports: [DentistDirectoryComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { data: initialData } },
        },
        { provide: MarketplaceService, useValue: marketplaceSpy },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(DentistDirectoryComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance };
  }

  it('renders verified clinics with doctor details, consultation fees, and trust badges', async () => {
    const { fixture } = await setupComponent();
    const text = fixture.nativeElement.textContent as string;

    expect(marketplaceSpy.getVerifiedClinics).toHaveBeenCalledWith('delhi-ncr');
    expect(text).toContain('Smile Perfect Dental');
    expect(text).toContain('Dr. Neha Gupta');
    expect(text).toContain('Apex Dental Care');
    expect(text).toContain('Dr. Rajesh Khanna');
    expect(text).toContain('₹500');
    expect(text).toContain('₹800');
    expect(text).toContain('DCI Registration Checked');
    expect(text).toContain('Available Today');
  });

  it('filters clinics by search term matching doctor name or treatment', async () => {
    const { fixture, component } = await setupComponent();

    component.searchTerm.set('Neha');
    fixture.detectChanges();
    expect(component.filteredClinics().length).toBe(1);
    expect(component.filteredClinics()[0].name).toBe('Smile Perfect Dental');

    component.searchTerm.set('Braces');
    fixture.detectChanges();
    expect(component.filteredClinics().length).toBe(1);
    expect(component.filteredClinics()[0].name).toBe('Apex Dental Care');
  });

  it('filters clinics by locality', async () => {
    const { fixture, component } = await setupComponent();

    component.chooseLocation('Noida');
    fixture.detectChanges();
    expect(component.filteredClinics().length).toBe(1);
    expect(component.filteredClinics()[0].city).toBe('Noida');

    component.chooseLocation('Delhi');
    fixture.detectChanges();
    expect(component.filteredClinics().length).toBe(1);
    expect(component.filteredClinics()[0].city).toBe('Delhi');
  });

  it('filters clinics when choosing a symptom from the quick problem triage bar', async () => {
    const { fixture, component } = await setupComponent();

    component.chooseService('root-canal');
    fixture.detectChanges();
    expect(component.filteredClinics().length).toBe(1);
    expect(component.filteredClinics()[0].name).toBe('Smile Perfect Dental');
  });

  it('generates active filter chips and allows individual chip removal', async () => {
    const { fixture, component } = await setupComponent();

    component.locality.set('Noida');
    component.serviceId.set('root-canal');
    component.availableTodayOnly.set(true);
    fixture.detectChanges();

    expect(component.activeFilterCount()).toBe(3);
    const chips = component.activeFilterChips();
    expect(chips.some(c => c.id === 'locality')).toBeTrue();
    expect(chips.some(c => c.id === 'service')).toBeTrue();
    expect(chips.some(c => c.id === 'today')).toBeTrue();

    component.removeFilter('locality');
    fixture.detectChanges();
    expect(component.locality()).toBe('');
    expect(component.activeFilterCount()).toBe(2);

    component.clearFilters();
    fixture.detectChanges();
    expect(component.activeFilterCount()).toBe(0);
    expect(component.filteredClinics().length).toBe(2);
  });

  it('removes a search chip without clearing the selected location', async () => {
    const { fixture, component } = await setupComponent();
    component.locality.set('Noida');
    component.searchTerm.set('No matching dentist');
    fixture.detectChanges();

    expect(component.filteredClinics().length).toBe(0);
    expect(component.activeFilterCount()).toBe(2);
    const removeSearch = fixture.nativeElement.querySelector('button[aria-label="Remove Search: No matching dentist"]') as HTMLButtonElement;
    expect(removeSearch).not.toBeNull();
    removeSearch.click();
    fixture.detectChanges();

    expect(component.searchTerm()).toBe('');
    expect(component.locality()).toBe('Noida');
    expect(component.filteredClinics().length).toBe(1);
    expect(component.activeFilterCount()).toBe(1);
  });

  it('adds and removes clinics for comparison up to a maximum of 3', async () => {
    const { component } = await setupComponent();

    expect(component.comparedClinics().length).toBe(0);

    component.toggleCompare('clinic-noida-1');
    expect(component.isCompared('clinic-noida-1')).toBeTrue();
    expect(component.comparedClinics().length).toBe(1);

    component.toggleCompare('clinic-delhi-1');
    expect(component.comparedClinics().length).toBe(2);

    component.toggleCompare('clinic-noida-1');
    expect(component.isCompared('clinic-noida-1')).toBeFalse();
    expect(component.comparedClinics().length).toBe(1);
  });

  it('toggles the mobile filter drawer', async () => {
    const { component } = await setupComponent();

    expect(component.isMobileFilterOpen()).toBeFalse();
    component.toggleMobileFilter();
    expect(component.isMobileFilterOpen()).toBeTrue();
    component.toggleMobileFilter();
    expect(component.isMobileFilterOpen()).toBeFalse();
  });

  it('switches between Dentists view and Dental Clinics view', async () => {
    const { fixture, component } = await setupComponent();

    expect(component.discoveryType()).toBe('dentists');
    component.discoveryType.set('clinics');
    fixture.detectChanges();
    expect(component.discoveryType()).toBe('clinics');
  });

  it('computes SEO page heading, kicker and lead paragraph dynamically based on search intent', async () => {
    const { fixture, component } = await setupComponent();

    expect(component.pageHeading()).toBe('Find the Right Dentist Near You in Delhi NCR');
    expect(component.pageKicker()).toBe('Delhi NCR Dental Discovery · Verified Clinics');

    marketplaceSpy.serviceLabel.and.returnValue('Root Canal Treatment');
    component.serviceId.set('root-canal');
    component.locality.set('Noida');
    fixture.detectChanges();

    expect(component.pageHeading()).toBe('Root Canal Treatment in Noida');
    expect(component.pageKicker()).toBe('Specialist Care · Verified Clinics in Noida');
    expect(component.pageLead()).toContain('Noida');

    component.locality.set('');
    fixture.detectChanges();
    expect(component.pageHeading()).toBe('Root Canal Treatment Specialists in Delhi NCR');
  });

  it('renders breadcrumbs matching Schema.org BreadcrumbList specification', async () => {
    const { fixture, component } = await setupComponent({ initialLocation: 'Noida' });

    const breadcrumbsNav = fixture.nativeElement.querySelector('.breadcrumbs-trail');
    expect(breadcrumbsNav).toBeTruthy();
    expect(breadcrumbsNav.textContent).toContain('Home');
    expect(breadcrumbsNav.textContent).toContain('Dentists');

    marketplaceSpy.serviceLabel.and.returnValue('Dental Implants');
    component.locality.set('Delhi');
    component.serviceId.set('dental-implants');
    fixture.detectChanges();

    expect(breadcrumbsNav.textContent).toContain('Delhi');
    expect(breadcrumbsNav.textContent).toContain('Dental Implants');
  });

  it('renders the treatment cost guide with indicative pricing', async () => {
    const { fixture, component } = await setupComponent();

    const costSection = fixture.nativeElement.querySelector('.cost-guide-section');
    expect(costSection).toBeTruthy();
    expect(costSection.textContent).toContain('Understand your care. Plan your budget.');
    expect(costSection.textContent).toContain('These are estimates, not clinic quotes.');
    expect(costSection.textContent).toContain('Root Canal Treatment (RCT)');
    expect(costSection.textContent).toContain('Dental Implants');
    expect(costSection.textContent).toContain('₹2,500 – ₹7,500');

    expect(component.treatmentCostGuide.length).toBeGreaterThanOrEqual(6);
  });

  it('expands treatment choices and applies a service from the guide', async () => {
    const { fixture, component } = await setupComponent();
    const guide = fixture.nativeElement.querySelector('.cost-guide-section') as HTMLElement;
    expect(guide.querySelectorAll('article').length).toBe(4);
    (guide.querySelector('button[aria-controls="treatment-options"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(guide.querySelectorAll('article').length).toBe(component.treatmentCostGuide.length);
    (guide.querySelector('button[aria-label="Find dentists for Teeth Whitening"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.serviceId()).toBe('teeth-whitening');
  });

  it('opens a modal filter panel and returns to results with the chosen filters', async () => {
    const { fixture, component } = await setupComponent();
    component.toggleMobileFilter();
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBeTrue();
    const treatment = dialog.querySelector('#filter-treatment') as HTMLSelectElement;
    treatment.value = 'root-canal';
    treatment.dispatchEvent(new Event('change'));
    (dialog.querySelector('.filter-footer .primary') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(dialog.open).toBeFalse();
    expect(component.isMobileFilterOpen()).toBeFalse();
    expect(component.filteredClinics().map(clinic => clinic.id)).toEqual(['clinic-noida-1']);
  });

  it('connects the listing card comparison action and preserves booking links', async () => {
    const { fixture, component } = await setupComponent();
    const card = fixture.nativeElement.querySelector('app-dentist-listing-card') as HTMLElement;
    (card.querySelector('.compare-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.comparedClinics().length).toBe(1);
    expect(card.querySelector('.booking a')?.getAttribute('href')).toContain('/book');
    expect(card.querySelector('.slot-options a')?.getAttribute('href')).toContain('doctorId=doc-1');
  });

  it('provides dynamic FAQs tailored to active treatment service', async () => {
    const { component } = await setupComponent();

    expect(component.dynamicFaqs().length).toBeGreaterThan(0);

    component.serviceId.set('root-canal');
    const rctFaqs = component.dynamicFaqs();
    expect(rctFaqs.some(f => f.question.includes('root canal'))).toBeTrue();

    component.serviceId.set('dental-implants');
    const implantFaqs = component.dynamicFaqs();
    expect(implantFaqs.some(f => f.question.includes('dental implant'))).toBeTrue();
  });
});
