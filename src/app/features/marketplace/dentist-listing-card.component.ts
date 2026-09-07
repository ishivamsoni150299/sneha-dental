import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MarketplaceService, type MarketplaceClinic, type MarketplaceAvailabilitySlot } from '../../core/services/marketplace.service';

@Component({
  selector: 'app-dentist-listing-card',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dentist-listing-card.component.html',
  styleUrl: './dentist-listing-card.component.css',
})
export class DentistListingCardComponent {
  private readonly marketplace = inject(MarketplaceService);
  readonly clinic = input.required<MarketplaceClinic>();
  readonly discoveryType = input<'dentists' | 'clinics'>('dentists');
  readonly slots = input<MarketplaceAvailabilitySlot[]>([]);
  readonly availabilityError = input(false);
  readonly distance = input<number | null>(null);
  readonly rating = input(0);
  readonly reviewCount = input(0);
  readonly compared = input(false);
  readonly videoOnly = input(false);
  readonly consultationFee = computed(() => this.videoOnly()
    ? this.clinic().marketplaceProfile?.videoConsultationFee : this.clinic().marketplaceProfile?.consultationFee);
  readonly compareToggled = output<void>();
  readonly retryAvailability = output<void>();
  readonly profilePath = computed(() => [this.discoveryType() === 'dentists' ? '/dentist' : '/clinic', this.clinic().marketplaceSlug ?? '']);
  readonly listingImage = computed(() => this.marketplace.listingImage(this.clinic()));
  readonly hasListingPhoto = computed(() => this.marketplace.hasListingPhoto(this.clinic()));
  readonly serviceLabels = computed(() => this.clinic().marketplaceProfile?.serviceIds.map(id => this.marketplace.serviceLabel(id)) ?? []);
  readonly initials = computed(() => (this.clinic().doctorName || this.clinic().name)
    .replace(/^dr\.?\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase());
  slotLabel(slot: MarketplaceAvailabilitySlot): string {
    return new Date(slot.startsAt).toLocaleTimeString('en-IN', {
      hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata',
    });
  }
}
