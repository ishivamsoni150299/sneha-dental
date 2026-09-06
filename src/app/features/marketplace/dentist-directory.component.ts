import { ChangeDetectionStrategy, Component, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
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
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly services = MARKETPLACE_DENTAL_SERVICES;
  readonly clinics = signal<MarketplaceClinic[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly searchTerm = signal('');
  readonly locality = signal('');
  readonly serviceId = signal('');
  readonly compareIds = signal<string[]>([]);
  readonly availability = signal<Record<string, MarketplaceAvailabilitySlot | null>>({});
  readonly availabilityLoading = signal<string | null>(null);
  readonly popularServices = MARKETPLACE_DENTAL_SERVICES.filter(service =>
    ['root-canal', 'dental-implants', 'braces-orthodontics', 'teeth-whitening', 'emergency-dental-care'].includes(service.id),
  );
  readonly patientProblems = [
    { label: 'Tooth pain', serviceId: 'emergency-dental-care' },
    { label: 'Root canal', serviceId: 'root-canal' },
    { label: 'Missing tooth', serviceId: 'dental-implants' },
    { label: 'Braces or aligners', serviceId: 'braces-orthodontics' },
    { label: 'Child dental care', serviceId: 'pediatric-dentistry' },
    { label: 'Cleaning', serviceId: 'cleaning-scaling' },
  ];
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

  readonly filteredClinics = computed(() => {
    const search = this.searchTerm().trim().toLowerCase();
    const locality = this.locality();
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
        return (!search || haystack.includes(search)) &&
          (!locality || profile.locality === locality) &&
          (!serviceId || profile.serviceIds.includes(serviceId as MarketplaceDentalServiceId));
      })
      .sort((first, second) => this.listingScore(second) - this.listingScore(first));
  });

  readonly hasFilters = computed(() => Boolean(
    this.searchTerm().trim() || this.locality() || this.serviceId(),
  ));

  readonly comparedClinics = computed(() => {
    const selected = new Set(this.compareIds());
    return this.clinics().filter(clinic => selected.has(clinic.id));
  });

  async ngOnInit(): Promise<void> {
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
      this.clinics.set(await this.marketplace.getVerifiedClinics('delhi-ncr'));
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
    if (!clinic.marketplaceSlug || this.availabilityLoading()) return;
    this.availabilityLoading.set(clinic.id);
    try {
      const response = await this.marketplace.getAvailability(clinic.marketplaceSlug);
      const first = response.days.flatMap(day => day.slots)[0] ?? null;
      this.availability.update(current => ({ ...current, [clinic.id]: first }));
    } catch {
      this.availability.update(current => ({ ...current, [clinic.id]: null }));
    } finally {
      this.availabilityLoading.set(null);
    }
  }

  availabilityFor(clinicId: string): MarketplaceAvailabilitySlot | null | undefined {
    return this.availability()[clinicId];
  }

  availabilityLabel(slot: MarketplaceAvailabilitySlot): string {
    return new Date(slot.startsAt).toLocaleString('en-IN', {
      weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
    });
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
