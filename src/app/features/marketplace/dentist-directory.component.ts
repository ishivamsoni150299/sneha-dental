import { ChangeDetectionStrategy, Component, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
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
  imports: [RouterLink],
  templateUrl: './dentist-directory.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DentistDirectoryComponent implements OnInit {
  private readonly marketplace = inject(MarketplaceService);
  private readonly route = inject(ActivatedRoute);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly services = MARKETPLACE_DENTAL_SERVICES;
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
      answer: 'Select your preferred verified dentist or clinic, choose an available time slot (or choose "Request preferred time"), and submit your contact details. The clinic confirms your booking directly via WhatsApp/SMS.',
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

  readonly localities = computed(() => [...new Set(
    this.clinics()
      .map(clinic => clinic.marketplaceProfile?.locality.trim())
      .filter((value): value is string => Boolean(value)),
  )].sort((first, second) => first.localeCompare(second)));

  readonly languages = computed(() => [...new Set(
    this.clinics().flatMap(clinic => clinic.marketplaceProfile?.languages ?? []),
  )].sort((first, second) => first.localeCompare(second)));

  readonly activeFilterCount = computed(() => {
    let count = 0;
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
          (!this.userCoordinates() || this.distanceFor(clinic) == null || this.distanceFor(clinic)! <= 25);
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
      const clinics = await this.marketplace.getVerifiedClinics('delhi-ncr');
      this.clinics.set(clinics);
      await Promise.all(clinics.map(async clinic => {
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
      document.getElementById('marketplace-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    this.isMobileFilterOpen.update(value => !value);
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
      const response = await this.marketplace.getAvailability(clinic.marketplaceSlug, 1);
      const slots = (response.days[0]?.slots ?? []).slice(0, 4);
      this.availability.update(current => ({ ...current, [clinic.id]: slots }));
    } catch {
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
    if (this.sortBy() === 'earliest') return this.slotsFor(second.id).length - this.slotsFor(first.id).length;
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
