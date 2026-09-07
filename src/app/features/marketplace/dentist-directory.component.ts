import { ChangeDetectionStrategy, Component, ElementRef, OnInit, PLATFORM_ID, computed, inject, signal, viewChild } from '@angular/core';
import { TreatmentGuideComponent, type TreatmentCostGuideItem } from './treatment-guide.component';
import { DentistListingCardComponent } from './dentist-listing-card.component';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MARKETPLACE_DENTAL_SERVICES } from '../../core/config/marketplace.config';
import type { MarketplaceDentalServiceId } from '../../core/config/marketplace.config';
import {
  MarketplaceService,
  type MarketplaceAvailabilitySlot,
  type MarketplaceClinic,
} from '../../core/services/marketplace.service';

export interface ActiveFilterChip {
  id: string;
  label: string;
}

@Component({
  selector: 'app-dentist-directory',
  standalone: true,
  imports: [RouterLink, TreatmentGuideComponent, DentistListingCardComponent],
  templateUrl: './dentist-directory.component.html',
  styleUrl: './dentist-directory.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DentistDirectoryComponent implements OnInit {
  private readonly marketplace = inject(MarketplaceService);
  private readonly route = inject(ActivatedRoute);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly isDiscoveryHome = !this.route.snapshot.data['initialLocation'] && !this.route.snapshot.data['initialServiceId'];
  readonly routeHeading = this.route.snapshot.data['initialLocation']
    ? String(this.route.snapshot.data['title']).replace(/^Best /, '')
    : 'Good dental care. Close to you.';

  readonly pageHeading = computed(() => {
    const service = this.serviceId();
    const loc = this.locality();
    const routeTitle = this.route.snapshot.data['title'] as string | undefined;

    if (!service && !loc && routeTitle) {
      return routeTitle.replace(/ \| mydentalplatform$/, '');
    }
    if (service && loc) {
      const serviceLabel = this.marketplace.serviceLabel(service as MarketplaceDentalServiceId);
      return `${serviceLabel} in ${loc}`;
    }
    if (service) {
      const serviceLabel = this.marketplace.serviceLabel(service as MarketplaceDentalServiceId);
      return `${serviceLabel} Specialists in Delhi NCR`;
    }
    if (loc) {
      return `Best Dentists in ${loc}`;
    }
    return routeTitle?.replace(/ \| mydentalplatform$/, '') || 'Find the Right Dentist Near You in Delhi NCR';
  });

  readonly pageKicker = computed(() => {
    const service = this.serviceId();
    const loc = this.locality();
    if (service && loc) {
      return `Specialist Care · Verified Clinics in ${loc}`;
    }
    if (service) {
      return 'Specialist Dental Care · Verified Delhi NCR Clinics';
    }
    if (loc) {
      return `Verified Dental Clinics · ${loc}`;
    }
    return 'Delhi NCR Dental Discovery · Verified Clinics';
  });

  readonly pageLead = computed(() => {
    const service = this.serviceId();
    const loc = this.locality();
    if (service && loc) {
      const label = this.marketplace.serviceLabel(service as MarketplaceDentalServiceId);
      return `Compare verified ${label.toLowerCase()} specialists in ${loc}. View clinic safety checks, transparent consultation fees, and book available appointment slots online with zero booking fees.`;
    }
    if (service) {
      const label = this.marketplace.serviceLabel(service as MarketplaceDentalServiceId);
      return `Compare top-rated ${label.toLowerCase()} clinics across Delhi, Noida, Gurugram, Ghaziabad, and Faridabad. DCI-registered specialists, transparent fees, and same-day slots.`;
    }
    if (loc) {
      return `Discover top-rated, DCI-registered dentists and dental clinics across ${loc}. Compare consultation fees, check real-time availability, and request your appointment with zero booking fees.`;
    }
    return 'Tell us what you need. Compare verified dentists and dental clinics across Delhi NCR, check real-time appointment availability, and request a booking in 60 seconds with zero convenience fees.';
  });

  readonly currentBreadcrumbCity = computed(() => {
    const loc = this.locality();
    if (loc && loc !== 'All Delhi NCR') return loc;
    const initialLoc = this.route.snapshot.data['initialLocation'] as string | undefined;
    return initialLoc && initialLoc !== 'All Delhi NCR' ? initialLoc : '';
  });

  readonly currentBreadcrumbCitySlug = computed(() => {
    const city = this.currentBreadcrumbCity();
    return city ? city.toLowerCase().replace(/\s+/g, '-') : '';
  });

  readonly currentBreadcrumbTreatment = computed(() => {
    const sid = this.serviceId() || (this.route.snapshot.data['initialServiceId'] as string | undefined);
    return sid ? this.marketplace.serviceLabel(sid as MarketplaceDentalServiceId) : '';
  });

  readonly treatmentCostGuide: TreatmentCostGuideItem[] = [
    {
      treatment: 'Root Canal Treatment (RCT)',
      serviceId: 'root-canal',
      specialty: 'Endodontics',
      priceRange: '₹2,500 – ₹7,500',
      sittings: '1 – 2 Sittings',
      overview: 'Pain-free rotary nerve cleaning and biocompatible gutta-percha sealing. Crown charges separate.',
    },
    {
      treatment: 'Dental Implants',
      serviceId: 'dental-implants',
      specialty: 'Implantology',
      priceRange: '₹20,000 – ₹45,000',
      sittings: '2 – 3 Visits',
      overview: 'Permanent titanium or zirconia fixture with custom abutment and lifelike ceramic crown.',
    },
    {
      treatment: 'Braces & Teeth Alignment',
      serviceId: 'braces-orthodontics',
      specialty: 'Orthodontics',
      priceRange: '₹25,000 – ₹70,000',
      sittings: '12 – 18 Months',
      overview: 'Metal, ceramic, or self-ligating brackets to correct crooked teeth, spacing, and bite issues.',
    },
    {
      treatment: 'Clear Aligners',
      serviceId: 'clear-aligners',
      specialty: 'Orthodontics',
      priceRange: '₹55,000 – ₹1,50,000',
      sittings: '6 – 14 Months',
      overview: 'Custom transparent removable aligners for discreet, comfortable smile straightening without metal.',
    },
    {
      treatment: 'Teeth Cleaning & Scaling',
      serviceId: 'cleaning-scaling',
      specialty: 'Preventive Dentistry',
      priceRange: '₹800 – ₹2,200',
      sittings: '1 Sitting (30–45 min)',
      overview: 'Ultrasonic calculus removal, deep stain elimination, and surface polishing to prevent gum disease.',
    },
    {
      treatment: 'Teeth Whitening',
      serviceId: 'teeth-whitening',
      specialty: 'Cosmetic Dentistry',
      priceRange: '₹5,000 – ₹12,000',
      sittings: '1 Sitting (45–60 min)',
      overview: 'In-office professional LED or laser bleaching to lighten teeth up to 8 shades in a single session.',
    },
    {
      treatment: 'Wisdom Tooth Extraction',
      serviceId: 'wisdom-tooth',
      specialty: 'Oral Surgery',
      priceRange: '₹1,800 – ₹6,500',
      sittings: '1 Sitting',
      overview: 'Gentle, safe removal of impacted, painful, or misaligned third molars under local anesthesia.',
    },
    {
      treatment: 'Tooth Fillings & Restoration',
      serviceId: 'dental-fillings',
      specialty: 'Conservative Dentistry',
      priceRange: '₹1,000 – ₹2,800',
      sittings: '1 Sitting',
      overview: 'Tooth-colored composite resin fillings to repair cavities, restore chewing, and halt decay.',
    },
  ];

  readonly availabilityErrors = signal<Record<string, boolean>>({});
  readonly cleanProblems = [
    {label:'Toothache', icon:'ph-tooth', serviceId:'emergency-dental-care'},
    {label:'Root canal', icon:'ph-first-aid', serviceId:'root-canal'},
    {label:'Braces', icon:'ph-smiley', serviceId:'braces-orthodontics'},
    {label:'Implants', icon:'ph-tooth', serviceId:'dental-implants'},
    {label:'Cleaning', icon:'ph-sparkle', serviceId:'cleaning-scaling'},
    {label:'Kids', icon:'ph-baby', serviceId:'pediatric-dentistry'},
  ];
  profilePath(clinic: MarketplaceClinic): string[] {
    return [this.discoveryType() === 'dentists' ? '/dentist' : '/clinic', clinic.marketplaceSlug ?? ''];
  }

  readonly services = MARKETPLACE_DENTAL_SERVICES;
  readonly totalCount = signal(0);
  readonly clinics = signal<MarketplaceClinic[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly searchTerm = signal('');
  readonly locality = signal('');
  readonly serviceId = signal('');
  readonly discoveryType = signal<'dentists' | 'clinics'>('dentists');
  readonly availableTodayOnly = signal(false);
  readonly maxFee = signal<number | null>(null);
  readonly minExperience = signal(0);
  readonly gender = signal('');
  readonly minRating = signal(0);
  readonly language = signal('');
  readonly sortBy = signal('recommended');
  readonly userCoordinates = signal<{ latitude: number; longitude: number } | null>(null);
  readonly locating = signal(false);
  readonly locationError = signal<string | null>(null);
  readonly compareIds = signal<string[]>([]);
  readonly availability = signal<Record<string, MarketplaceAvailabilitySlot[]>>({});
  readonly reviewStats = signal<Record<string, { rating: number; count: number }>>({});
  readonly isMobileFilterOpen = signal(false);
  readonly filtersDialog = viewChild<ElementRef<HTMLDialogElement>>('filtersDialog');
  readonly isCompareModalOpen = signal(false);

  readonly popularServices = MARKETPLACE_DENTAL_SERVICES.filter(service =>
    ['root-canal', 'dental-implants', 'braces-orthodontics', 'teeth-whitening', 'emergency-dental-care'].includes(service.id),
  );

  readonly patientProblems = [
    { label: 'Severe Toothache', icon: '⚡', serviceId: 'emergency-dental-care', subtitle: 'Same-day relief' },
    { label: 'Root Canal', icon: '🦷', serviceId: 'root-canal', subtitle: 'Save natural tooth' },
    { label: 'Dental Implants', icon: '🔩', serviceId: 'dental-implants', subtitle: 'Permanent replacement' },
    { label: 'Braces & Aligners', icon: '😁', serviceId: 'braces-orthodontics', subtitle: 'Teeth straightening' },
    { label: 'Cleaning & Scaling', icon: '✨', serviceId: 'cleaning-scaling', subtitle: 'Plaque removal' },
    { label: 'Wisdom Tooth Pain', icon: '🩺', serviceId: 'wisdom-tooth', subtitle: 'Safe extraction' },
    { label: 'Child Dentistry', icon: '👧', serviceId: 'pediatric-dentistry', subtitle: 'Gentle pediatric care' },
    { label: 'Teeth Whitening', icon: '💎', serviceId: 'teeth-whitening', subtitle: 'Smile brightening' },
  ];

  readonly locationChoices = ['All Delhi NCR', 'Noida', 'Delhi', 'Gurugram', 'Ghaziabad', 'Faridabad'];

  readonly faqs = [
    {
      question: 'How are dentists verified on mydentalplatform?',
      answer: 'Every clinic and dentist must pass verified clinical checks: state Dental Council registration numbers are verified, the physical clinic address and contact numbers are confirmed, and consultation guidelines are checked before appearing.',
    },
    {
      question: 'Are there extra booking charges or hidden fees?',
      answer: 'No. Booking an appointment is 100% free for patients. All consultation and treatment fees are paid directly at the dental clinic with complete transparency.',
    },
    {
      question: 'Can I compare consultation fees before booking?',
      answer: 'Yes. Each verified clinic publishes its standard consultation fee, available dental treatments, experience of the dentist, and whether they are currently accepting new patients.',
    },
    {
      question: 'How do I request an appointment online?',
      answer: 'Select a dentist or clinic, choose an available appointment time, and submit your contact details. Your request needs confirmation from the clinic before the appointment is confirmed.',
    },
    {
      question: 'Can I find same-day dental appointments for emergencies?',
      answer: 'Yes. Toggle the "Available Today" filter to instantly discover clinics offering real-time open slots today for urgent toothache relief, trauma, or swollen gums.',
    },
    {
      question: 'Which areas in Delhi NCR are covered?',
      answer: 'We cover major hubs across Delhi NCR, including Noida (Sector 18, 62, 75, 76, 137), South & Central Delhi, Gurugram (DLF Cyber City, Sector 56, Golf Course Ext), Ghaziabad (Indirapuram, Vaishali), and Faridabad.',
    },
  ];

  readonly dynamicFaqs = computed(() => {
    const service = this.serviceId();
    if (service === 'root-canal') {
      return [
        {
          question: 'Is a root canal treatment painful?',
          answer: 'No. Modern rotary root canal treatment is performed under profound local anesthesia, making the entire procedure virtually pain-free. Most patients report feeling no more discomfort than a routine filling.',
        },
        {
          question: 'How much does a root canal cost in Delhi NCR?',
          answer: 'Root canal therapy typically ranges between ₹2,500 and ₹7,500 depending on tooth location (anterior vs. molar) and whether rotary micro-endodontics is required. Post-RCT dental crowns are priced separately.',
        },
        {
          question: 'Can a root canal be completed in a single sitting?',
          answer: 'Yes. In cases without acute apical abscess or severe infection, single-sitting rotary RCT is safe, clinically proven, and completed within 45 to 60 minutes.',
        },
        {
          question: 'Is a dental crown always necessary after RCT?',
          answer: 'For premolars and molars that endure heavy chewing forces, a crown (ceramic or zirconia) is strongly recommended to prevent the brittle tooth from fracturing.',
        },
        ...this.faqs.slice(0, 2),
      ];
    }
    if (service === 'dental-implants') {
      return [
        {
          question: 'What is the average cost of a dental implant in Delhi NCR?',
          answer: 'Standard titanium dental implants range from ₹20,000 to ₹45,000 per tooth, including the titanium fixture, abutment, and ceramic crown. Premium Swiss or German implants may cost between ₹35,000 and ₹55,000.',
        },
        {
          question: 'How long do dental implants last?',
          answer: 'With good oral hygiene and regular dental checkups, dental implants have a clinical success rate of over 95% and can easily last a lifetime.',
        },
        {
          question: 'Am I a candidate for dental implants?',
          answer: 'Most adults with adequate jawbone density and healthy gums are good candidates. For patients with bone loss, bone grafting or sinus lifts can restore eligibility.',
        },
        ...this.faqs.slice(0, 3),
      ];
    }
    return this.faqs;
  });

  readonly localities = computed(() => [...new Set(
    this.clinics()
      .map(clinic => clinic.marketplaceProfile?.locality.trim())
      .filter((value): value is string => Boolean(value) && !this.locationChoices.some(city => city.toLowerCase() === value?.toLowerCase())),
  )].sort((first, second) => first.localeCompare(second)));

  readonly languages = computed(() => [...new Set(
    this.clinics().flatMap(clinic => clinic.marketplaceProfile?.languages ?? []),
  )].sort((first, second) => first.localeCompare(second)));

  readonly activeFilterCount = computed(() => {
    let count = 0;
    if (this.searchTerm().trim()) count++;
    if (this.locality()) count++;
    if (this.serviceId()) count++;
    if (this.availableTodayOnly()) count++;
    if (this.maxFee() != null) count++;
    if (this.minExperience() > 0) count++;
    if (this.gender()) count++;
    if (this.minRating() > 0) count++;
    if (this.language()) count++;
    if (this.userCoordinates()) count++;
    return count;
  });

  readonly activeFilterChips = computed<ActiveFilterChip[]>(() => {
    const chips: ActiveFilterChip[] = [];
    if (this.searchTerm().trim()) {
      chips.push({ id: 'search', label: `Search: ${this.searchTerm().trim()}` });
    }
    if (this.locality()) {
      chips.push({ id: 'locality', label: `Location: ${this.locality()}` });
    }
    if (this.userCoordinates()) {
      chips.push({ id: 'gps', label: 'Near Me (GPS)' });
    }
    if (this.serviceId()) {
      chips.push({ id: 'service', label: this.marketplace.serviceLabel(this.serviceId() as MarketplaceDentalServiceId) });
    }
    if (this.availableTodayOnly()) {
      chips.push({ id: 'today', label: 'Available Today' });
    }
    if (this.maxFee() != null) {
      chips.push({ id: 'fee', label: `Max Fee: ₹${this.maxFee()}` });
    }
    if (this.minExperience() > 0) {
      chips.push({ id: 'experience', label: `${this.minExperience()}+ Yrs Exp` });
    }
    if (this.minRating() > 0) {
      chips.push({ id: 'rating', label: `${this.minRating()}+ ★ Rating` });
    }
    if (this.gender()) {
      chips.push({ id: 'gender', label: this.gender() === 'female' ? 'Female Dentist' : 'Male Dentist' });
    }
    if (this.language()) {
      chips.push({ id: 'language', label: `Language: ${this.language()}` });
    }
    return chips;
  });

  readonly filteredClinics = computed(() => {
    const search = this.searchTerm().trim().toLowerCase();
    const locality = this.locality().toLowerCase();
    const serviceId = this.serviceId();

    return this.clinics()
      .filter(clinic => {
        const profile = clinic.marketplaceProfile!;
        const haystack = [
          clinic.name,
          clinic.doctorName,
          clinic.city,
          profile.locality,
          clinic.doctorQualification,
          profile.speciality,
          ...profile.serviceIds.map(id => this.marketplace.serviceLabel(id)),
        ].join(' ').toLowerCase();
        const fee = profile.consultationFee;
        const rating = this.ratingFor(clinic.id);
        return (!search || haystack.includes(search)) &&
          (!locality || `${profile.locality} ${clinic.city}`.toLowerCase().includes(locality)) &&
          (!serviceId || profile.serviceIds.includes(serviceId as MarketplaceDentalServiceId)) &&
          (!this.availableTodayOnly() || this.slotsFor(clinic.id).length > 0) &&
          (this.maxFee() == null || (fee != null && fee <= this.maxFee()!)) &&
          (!this.minExperience() || (profile.experienceYears ?? 0) >= this.minExperience()) &&
          (!this.gender() || profile.gender === this.gender()) &&
          (!this.minRating() || rating >= this.minRating()) &&
          (!this.language() || profile.languages.includes(this.language())) &&
          (!this.userCoordinates() || (this.distanceFor(clinic) !== null && this.distanceFor(clinic)! <= 25));
      })
      .sort((first, second) => this.compareListings(first, second));
  });

  readonly hasFilters = computed(() => Boolean(
    this.searchTerm().trim() || this.locality() || this.serviceId() || this.availableTodayOnly() ||
    this.maxFee() != null || this.minExperience() || this.gender() || this.minRating() || this.language() || this.userCoordinates(),
  ));

  readonly comparedClinics = computed(() => {
    const selected = new Set(this.compareIds());
    return this.clinics().filter(clinic => selected.has(clinic.id));
  });

  async ngOnInit(): Promise<void> {
    const initialLocation = String(this.route.snapshot.data['initialLocation'] ?? '');
    if (initialLocation && initialLocation !== 'All Delhi NCR') {
      this.locality.set(initialLocation);
    }
    this.serviceId.set(String(this.route.snapshot.data['initialServiceId'] ?? ''));
    if (!this.isBrowser) {
      this.loading.set(false);
      return;
    }
    await this.loadClinics();
  }

  async retry(): Promise<void> {
    await this.loadClinics();
  }

  private async loadClinics(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const response = await this.marketplace.getVerifiedClinics('delhi-ncr');
      this.clinics.set(response.dentists);
      this.totalCount.set(response.totalCount);
      await Promise.all(response.dentists.map(async clinic => {
        await this.checkAvailability(clinic);
        try {
          const reviews = await this.marketplace.getPublishedReviews(clinic.id);
          const rating = reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0;
          this.reviewStats.update(current => ({ ...current, [clinic.id]: { rating, count: reviews.length } }));
        } catch {
          this.reviewStats.update(current => ({ ...current, [clinic.id]: { rating: 0, count: 0 } }));
        }
      }));
    } catch (error) {
      console.error('[Marketplace] Directory load failed:', error);
      this.error.set('Dentist listings could not be loaded. Please try again shortly.');
    } finally {
      this.loading.set(false);
    }
  }

  updateSearch(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  updateLocality(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.locality.set(value === 'All Delhi NCR' ? '' : value);
  }

  updateService(event: Event): void {
    this.serviceId.set((event.target as HTMLSelectElement).value);
  }

  clearFilters(): void {
    this.searchTerm.set('');
    this.locality.set('');
    this.serviceId.set('');
    this.availableTodayOnly.set(false);
    this.maxFee.set(null);
    this.minExperience.set(0);
    this.gender.set('');
    this.minRating.set(0);
    this.language.set('');
    this.userCoordinates.set(null);
    this.locationError.set(null);
    this.sortBy.set('recommended');
  }

  removeFilter(chipId: string): void {
    switch (chipId) {
      case 'search':
        this.searchTerm.set('');
        break;
      case 'locality':
        this.locality.set('');
        break;
      case 'gps':
        this.userCoordinates.set(null);
        if (this.sortBy() === 'distance') this.sortBy.set('recommended');
        break;
      case 'service':
        this.serviceId.set('');
        break;
      case 'today':
        this.availableTodayOnly.set(false);
        break;
      case 'fee':
        this.maxFee.set(null);
        break;
      case 'experience':
        this.minExperience.set(0);
        break;
      case 'rating':
        this.minRating.set(0);
        break;
      case 'gender':
        this.gender.set('');
        break;
      case 'language':
        this.language.set('');
        break;
    }
  }

  chooseLocation(location: string): void {
    this.userCoordinates.set(null);
    this.locality.set(location === 'All Delhi NCR' ? '' : location);
    this.findDentists();
  }

  chooseService(serviceId: string): void {
    this.searchTerm.set('');
    this.serviceId.set(serviceId);
    this.findDentists();
  }

  useMyLocation(): void {
    if (!this.isBrowser || !navigator.geolocation) {
      this.locationError.set('Geolocation is not supported in this browser.');
      return;
    }
    this.locating.set(true);
    this.locationError.set(null);
    navigator.geolocation.getCurrentPosition(
      position => {
        this.locality.set('');
        this.userCoordinates.set({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        this.sortBy.set('distance');
        this.locating.set(false);
        this.findDentists();
      },
      () => {
        this.locating.set(false);
        this.locationError.set('Please allow location access or choose your city.');
      },
      { timeout: 8000 }
    );
  }

  findDentists(): void {
    if (this.isBrowser) {
      const results = document.getElementById('marketplace-results');
      results?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
      results?.focus({ preventScroll: true });
    }
  }

  updateFee(event: Event): void {
    const value = Number((event.target as HTMLSelectElement).value);
    this.maxFee.set(value > 0 ? value : null);
  }

  updateExperience(event: Event): void {
    this.minExperience.set(Number((event.target as HTMLSelectElement).value));
  }

  updateGender(event: Event): void {
    this.gender.set((event.target as HTMLSelectElement).value);
  }

  updateRating(event: Event): void {
    this.minRating.set(Number((event.target as HTMLSelectElement).value));
  }

  updateLanguage(event: Event): void {
    this.language.set((event.target as HTMLSelectElement).value);
  }

  updateSort(event: Event): void {
    this.sortBy.set((event.target as HTMLSelectElement).value);
  }

  toggleMobileFilter(): void {
    if (this.isMobileFilterOpen()) {
      this.closeFilters();
    } else {
      this.filtersDialog()?.nativeElement.showModal();
      this.isMobileFilterOpen.set(true);
    }
  }

  closeFilters(): void {
    this.filtersDialog()?.nativeElement.close();
    this.isMobileFilterOpen.set(false);
  }

  editSearch(): void {
    if (!this.isBrowser) return;
    const search = document.getElementById('dentist-search');
    search?.scrollIntoView({ block: 'center' });
    search?.focus({ preventScroll: true });
  }

  openCompareModal(): void {
    this.isCompareModalOpen.set(true);
  }

  closeCompareModal(): void {
    this.isCompareModalOpen.set(false);
  }

  serviceLabels(clinic: MarketplaceClinic): string[] {
    return clinic.marketplaceProfile!.serviceIds
      .slice(0, 3)
      .map(serviceId => this.marketplace.serviceLabel(serviceId));
  }

  listingImage(clinic: MarketplaceClinic): string {
    return this.marketplace.listingImage(clinic);
  }

  hasListingPhoto(clinic: MarketplaceClinic): boolean {
    return this.marketplace.hasListingPhoto(clinic);
  }

  getInitials(clinic: MarketplaceClinic): string {
    const name = this.discoveryType() === 'dentists'
      ? (clinic.doctorName || clinic.name)
      : clinic.name;
    const clean = name.replace(/^Dr\.\s*/i, '').trim();
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return clean.slice(0, 2).toUpperCase() || 'DR';
  }

  getRatingText(rating: number): string {
    if (rating >= 4.8) return 'Exceptional';
    if (rating >= 4.5) return 'Excellent';
    if (rating >= 4.0) return 'Very Good';
    if (rating > 0) return 'Good';
    return 'New';
  }

  toggleCompare(clinicId: string): void {
    this.compareIds.update(current => {
      if (current.includes(clinicId)) return current.filter(id => id !== clinicId);
      return current.length < 3 ? [...current, clinicId] : current;
    });
  }

  isCompared(clinicId: string): boolean {
    return this.compareIds().includes(clinicId);
  }

  async checkAvailability(clinic: MarketplaceClinic): Promise<void> {
    if (!clinic.marketplaceSlug) return;
    try {
      this.availabilityErrors.update(current => ({...current, [clinic.id]: false}));
      const response = await this.marketplace.getAvailability(clinic.marketplaceSlug, 1);
      const slots = (response.days[0]?.slots ?? []).slice(0, 4);
      this.availability.update(current => ({ ...current, [clinic.id]: slots }));
    } catch {
      this.availabilityErrors.update(current => ({...current, [clinic.id]: true}));
      this.availability.update(current => ({ ...current, [clinic.id]: [] }));
    }
  }

  slotsFor(clinicId: string): MarketplaceAvailabilitySlot[] {
    return this.availability()[clinicId] ?? [];
  }

  ratingFor(clinicId: string): number {
    return this.reviewStats()[clinicId]?.rating ?? 0;
  }

  reviewCountFor(clinicId: string): number {
    return this.reviewStats()[clinicId]?.count ?? 0;
  }

  slotLabel(slot: MarketplaceAvailabilitySlot): string {
    return new Date(slot.startsAt).toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'Asia/Kolkata',
    });
  }

  distanceFor(clinic: MarketplaceClinic): number | null {
    const user = this.userCoordinates();
    const profile = clinic.marketplaceProfile;
    if (!user || profile?.latitude == null || profile.longitude == null) return null;
    const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
    const latitude = toRadians(profile.latitude - user.latitude);
    const longitude = toRadians(profile.longitude - user.longitude);
    const value =
      Math.sin(latitude / 2) ** 2 +
      Math.cos(toRadians(user.latitude)) *
        Math.cos(toRadians(profile.latitude)) *
        Math.sin(longitude / 2) ** 2;
    return Math.round(6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)) * 10) / 10;
  }

  private compareListings(first: MarketplaceClinic, second: MarketplaceClinic): number {
    if (this.sortBy() === 'distance') {
      const dist1 = this.distanceFor(first) ?? 999999;
      const dist2 = this.distanceFor(second) ?? 999999;
      return dist1 - dist2;
    }
    if (this.sortBy() === 'rating') return this.ratingFor(second.id) - this.ratingFor(first.id);
    if (this.sortBy() === 'fee')
      return (first.marketplaceProfile?.consultationFee ?? 999999) - (second.marketplaceProfile?.consultationFee ?? 999999);
    if (this.sortBy() === 'experience')
      return (second.marketplaceProfile?.experienceYears ?? 0) - (first.marketplaceProfile?.experienceYears ?? 0);
    if (this.sortBy() === 'earliest') return (Date.parse(this.slotsFor(first.id)[0]?.startsAt) || Infinity) - (Date.parse(this.slotsFor(second.id)[0]?.startsAt) || Infinity);
    return this.listingScore(second) - this.listingScore(first);
  }

  private listingScore(clinic: MarketplaceClinic): number {
    const profile = clinic.marketplaceProfile!;
    return (
      (profile.acceptingNewPatients ? 20 : 0) +
      (this.locality() && profile.locality.toLowerCase().includes(this.locality().toLowerCase()) ? 12 : 0) +
      (this.slotsFor(clinic.id).length > 0 ? 8 : 0) +
      (this.marketplace.hasListingPhoto(clinic) ? 4 : 0) +
      (profile.consultationFee != null ? 3 : 0) +
      Math.min(profile.serviceIds.length, 5)
    );
  }
}
