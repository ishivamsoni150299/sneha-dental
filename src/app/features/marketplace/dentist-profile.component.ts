import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { Doctor } from '../../core/services/doctor.service';
import { DoctorService } from '../../core/services/doctor.service';
import {
  MarketplaceService,
  type MarketplaceClinic,
} from '../../core/services/marketplace.service';

@Component({
  selector: 'app-dentist-profile',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './dentist-profile.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DentistProfileComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly marketplace = inject(MarketplaceService);
  private readonly doctorService = inject(DoctorService);

  readonly clinic = signal<MarketplaceClinic | null>(null);
  readonly verifiedDoctors = signal<Doctor[]>([]);
  readonly loading = signal(true);
  readonly notFound = signal(false);
  readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    const slug = this.route.snapshot.paramMap.get('slug') ?? '';
    try {
      const clinic = await this.marketplace.getVerifiedClinicBySlug(slug);
      if (!clinic) {
        this.notFound.set(true);
        return;
      }

      this.clinic.set(clinic);
      const verifiedIds = new Set(clinic.marketplaceVerifiedDoctorIds ?? []);
      if (verifiedIds.size > 0) {
        try {
          const doctors = await this.doctorService.getDoctors(clinic.id);
          this.verifiedDoctors.set(doctors.filter(doctor => doctor.id && verifiedIds.has(doctor.id)));
        } catch (error) {
          console.error('[Marketplace] Verified doctors could not be loaded:', error);
        }
      }
    } catch (error) {
      console.error('[Marketplace] Profile load failed:', error);
      this.error.set('This clinic profile could not be loaded. Please try again shortly.');
    } finally {
      this.loading.set(false);
    }
  }

  serviceLabels(clinic: MarketplaceClinic): string[] {
    return clinic.marketplaceProfile!.serviceIds.map(serviceId =>
      this.marketplace.serviceLabel(serviceId),
    );
  }

  listingImage(clinic: MarketplaceClinic): string {
    return this.marketplace.listingImage(clinic);
  }

  hasListingPhoto(clinic: MarketplaceClinic): boolean {
    return this.marketplace.hasListingPhoto(clinic);
  }

  clinicWebsiteUrl(clinic: MarketplaceClinic): string | null {
    return this.marketplace.clinicWebsiteUrl(clinic);
  }

  clinicBookingUrl(clinic: MarketplaceClinic): string | null {
    return this.marketplace.clinicBookingUrl(clinic);
  }

  phoneUrl(clinic: MarketplaceClinic): string | null {
    const digits = String(clinic.phoneE164 || clinic.phone || '').replace(/\D/g, '');
    return digits ? `tel:+${digits}` : null;
  }

  whatsappUrl(clinic: MarketplaceClinic): string | null {
    const digits = String(clinic.whatsappNumber || '').replace(/\D/g, '');
    if (!digits) return null;
    const message = `Hi ${clinic.name}, I found your verified profile on mydentalplatform and would like an appointment.`;
    return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  }

  address(clinic: MarketplaceClinic): string {
    return [
      clinic.addressLine1,
      clinic.addressLine2,
      clinic.marketplaceProfile?.locality,
      clinic.city,
    ].filter(Boolean).join(', ');
  }

  formattedFee(clinic: MarketplaceClinic): string {
    const fee = clinic.marketplaceProfile?.consultationFee;
    return fee == null ? 'Ask clinic' : `₹${fee.toLocaleString('en-IN')}`;
  }

  doctorInitials(name: string): string {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  }
}