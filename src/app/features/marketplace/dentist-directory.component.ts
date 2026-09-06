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
  readonly locationError = signal<string | null>(null);
  readonly compareIds = signal<string[]>([]);
  readonly availability = signal<Record<string, MarketplaceAvailabilitySlot[]>>({});
  readonly reviewStats = signal<Record<string, { rating: number; count: number }>>({});
  readonly popularServices = MARKETPLACE_DENTAL_SERVICES.filter(service =>
    ['root-canal', 'dental-implants', 'braces-orthodontics', 'teeth-whitening', 'emergency-dental-care'].includes(service.id),
  );
  readonly patientProblems = [
    { label: 'Toothache', icon: '⚡', serviceId: 'emergency-dental-care' },
    { label: 'Root Canal', icon: '🦷', serviceId: 'root-canal' },
    { label: 'Braces', icon: '😁', serviceId: 'braces-orthodontics' },
    { label: 'Implant', icon: '🔩', serviceId: 'dental-implants' },
    { label: 'Cleaning', icon: '✨', serviceId: 'cleaning-scaling' },
    { label: 'Child Dentist', icon: '👧', serviceId: 'pediatric-dentistry' },
    { label: 'Emergency', icon: '🚨', serviceId: 'emergency-dental-care' },
  ];
  readonly locationChoices = ['Noida', 'Delhi', 'Gurugram'];
  readonly faqs = [
    {
      question: 'How are dentists verified on mydentalplatform?',
      answer: 'A clinic appears in search only after its identity, address, phone number and dentist registration details have been reviewed.',
    },
    {
      question: 'Can I compare consultation fees before booking?',
      answer: 'Yes. Clinics can publish their consultation fee, services, locality and whether they are accepting new patients.',
    },
    {
      question: 'How do I request a dental appointment?',
      answer: 'Open a clinic profile, choose Request appointment, and submit your preferred date and time. The clinic confirms the request directly.',
    },
    {
      question: 'Which Delhi NCR areas are covered?',
      answer: 'The directory is expanding across Delhi, Noida, Gurugram, Ghaziabad and Faridabad as clinics complete verification.',
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
    this.locality.set(String(this.route.snapshot.data['initialLocation'] ?? ''));
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
    this.locality.set((event.target as HTMLSelectElement).value);
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
  }

  chooseLocation(location: string): void {
    this.userCoordinates.set(null);
    this.locality.set(location);
  }

  useMyLocation(): void {
    if (!this.isBrowser || !navigator.geolocation) return;
    this.locationError.set(null);
    navigator.geolocation.getCurrentPosition(position => {
      this.locality.set('');
      this.userCoordinates.set({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      this.findDentists();
    }, () => this.locationError.set('Allow location access or choose a city.'));
  }

  findDentists(): void {
    if (this.isBrowser) {
      document.getElementById('marketplace-results')?.scrollIntoView({ behavior: 'smooth' });
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

  chooseService(serviceId: string): void {
    this.serviceId.set(serviceId);
    if (this.isBrowser) {
      document.getElementById('marketplace-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
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
      const slots = (response.days[0]?.slots ?? []).slice(0, 3);
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
      hour: 'numeric', minute: '2-digit',
    });
  }

  distanceFor(clinic: MarketplaceClinic): number | null {
    const user = this.userCoordinates();
    const profile = clinic.marketplaceProfile;
    if (!user || profile?.latitude == null || profile.longitude == null) return null;
    const toRadians = (degrees: number) => degrees * Math.PI / 180;
    const latitude = toRadians(profile.latitude - user.latitude);
    const longitude = toRadians(profile.longitude - user.longitude);
    const value = Math.sin(latitude / 2) ** 2 + Math.cos(toRadians(user.latitude)) *
      Math.cos(toRadians(profile.latitude)) * Math.sin(longitude / 2) ** 2;
    return Math.round(6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)) * 10) / 10;
  }

  private compareListings(first: MarketplaceClinic, second: MarketplaceClinic): number {
    if (this.sortBy() === 'rating') return this.ratingFor(second.id) - this.ratingFor(first.id);
    if (this.sortBy() === 'fee') return (first.marketplaceProfile?.consultationFee ?? 999999) - (second.marketplaceProfile?.consultationFee ?? 999999);
    if (this.sortBy() === 'experience') return (second.marketplaceProfile?.experienceYears ?? 0) - (first.marketplaceProfile?.experienceYears ?? 0);
    if (this.sortBy() === 'earliest') return this.slotsFor(second.id).length - this.slotsFor(first.id).length;
    return this.listingScore(second) - this.listingScore(first);
  }

  private listingScore(clinic: MarketplaceClinic): number {
    const profile = clinic.marketplaceProfile!;
    return (profile.acceptingNewPatients ? 20 : 0) +
      (this.locality() && profile.locality === this.locality() ? 10 : 0) +
      (this.marketplace.hasListingPhoto(clinic) ? 3 : 0) +
      (profile.consultationFee != null ? 2 : 0) +
      Math.min(profile.serviceIds.length, 5);
  }
}
