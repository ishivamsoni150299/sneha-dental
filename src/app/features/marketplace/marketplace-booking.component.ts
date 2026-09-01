import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  isClinicOpenAt,
  type BookingClinicContext,
} from '../../core/services/appointment.service';
import { DoctorService, type Doctor } from '../../core/services/doctor.service';
import {
  AppointmentComponent,
  type BookingSubmission,
} from '../appointment/appointment.component';
import {
  MarketplaceService,
  type MarketplaceClinic,
} from '../../core/services/marketplace.service';

@Component({
  selector: 'app-marketplace-booking',
  standalone: true,
  imports: [AppointmentComponent, RouterLink],
  templateUrl: './marketplace-booking.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarketplaceBookingComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly marketplace = inject(MarketplaceService);
  private readonly doctors = inject(DoctorService);

  readonly clinic = signal<MarketplaceClinic | null>(null);
  readonly context = signal<BookingClinicContext | null>(null);
  readonly submission = signal<BookingSubmission | null>(null);
  readonly loading = signal(true);
  readonly notFound = signal(false);
  readonly unavailable = signal(false);
  readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    const slug = this.route.snapshot.paramMap.get('slug') ?? '';
    try {
      const clinic = await this.marketplace.getVerifiedClinicBySlug(slug);
      if (!clinic) {
        this.notFound.set(true);
        return;
      }
      if (!clinic.marketplaceProfile?.acceptingNewPatients) {
        this.unavailable.set(true);
        return;
      }

      const verifiedDoctorIds = new Set(clinic.marketplaceVerifiedDoctorIds ?? []);
      let verifiedDoctors: Doctor[] = [];
      try {
        verifiedDoctors = (await this.doctors.getDoctors(clinic.id)).filter(
          doctor => doctor.available && Boolean(doctor.id && verifiedDoctorIds.has(doctor.id)),
        );
      } catch (error) {
        console.error('[Marketplace] Booking doctors could not be loaded:', error);
      }

      const services = clinic.marketplaceProfile.serviceIds.map(serviceId => {
        const name = this.marketplace.serviceLabel(serviceId);
        const clinicService = clinic.services.find(
          service => service.name.trim().toLowerCase() === name.toLowerCase(),
        );
        return { name, price: clinicService?.price };
      });
      const address = [
        clinic.addressLine1,
        clinic.addressLine2,
        clinic.marketplaceProfile.locality,
        clinic.city,
      ].filter(Boolean).join(', ');

      this.clinic.set(clinic);
      this.context.set({
        clinicId: clinic.id,
        bookingRefPrefix: clinic.bookingRefPrefix,
        displayName: clinic.name,
        phone: clinic.phone,
        phoneE164: clinic.phoneE164,
        whatsappNumber: clinic.whatsappNumber,
        address,
        hours: clinic.hours,
        services,
        doctors: verifiedDoctors,
        isOpenNow: isClinicOpenAt(clinic.hours),
        source: 'marketplace',
        attribution: {
          marketplaceSlug: clinic.marketplaceSlug,
          entryPath: `/dentists/${clinic.marketplaceSlug}/book`,
        },
      });
    } catch (error) {
      console.error('[Marketplace] Booking page load failed:', error);
      this.error.set('This booking page could not be loaded. Please try again shortly.');
    } finally {
      this.loading.set(false);
    }
  }

  onBooked(submission: BookingSubmission): void {
    this.submission.set(submission);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  formattedDate(value: string): string {
    return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }
}