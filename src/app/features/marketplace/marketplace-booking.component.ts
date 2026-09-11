import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  isClinicOpenAt,
  type BookingClinicContext,
} from '../../core/services/appointment.service';
import { DoctorService, DEFAULT_SCHEDULE, type Doctor } from '../../core/services/doctor.service';
import {
  AppointmentComponent,
  type BookingSubmission,
} from '../appointment/appointment.component';
import {
  MarketplaceService,
  type MarketplaceClinic,
} from '../../core/services/marketplace.service';
import { SlotPickerComponent, type SelectedSlot } from '../../shared/components/slot-picker/slot-picker.component';

@Component({
  selector: 'app-marketplace-booking',
  standalone: true,
  imports: [AppointmentComponent, RouterLink, SlotPickerComponent],
  templateUrl: './marketplace-booking.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarketplaceBookingComponent implements OnInit {
  readonly route = inject(ActivatedRoute);
  private readonly marketplace = inject(MarketplaceService);
  private readonly doctors = inject(DoctorService);

  readonly clinic = signal<MarketplaceClinic | null>(null);
  readonly context = signal<BookingClinicContext | null>(null);
  readonly submission = signal<BookingSubmission | null>(null);
  readonly selectedSlot = signal<SelectedSlot | null>(null);
  private readonly slotPicker = viewChild(SlotPickerComponent);
  readonly consultationMode = signal<'in_person' | 'video'>('in_person');
  readonly videoReady = signal(false);
  readonly videoUnavailable = signal(false);
  readonly isIndependent = computed(() => Boolean(this.clinic()?.isIndependent));
  readonly eligibleForInClinic = computed(() => !this.isIndependent());
  readonly selectedContext = computed(() => {
    const context = this.context();
    if (!context) return null;
    return this.consultationMode() === 'video' ? {
      ...context, consultationMode: 'video' as const,
      services: [{ name: 'Video Consultation', price: this.clinic()?.marketplaceProfile?.videoConsultationFee == null
        ? undefined : `₹${this.clinic()!.marketplaceProfile!.videoConsultationFee}` }],
    } : { ...context, consultationMode: 'in_person' as const };
  });
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

      let verifiedDoctors: Doctor[] = [];
      if (clinic.isIndependent) {
        verifiedDoctors = [{
          id: clinic.id,
          name: clinic.doctorName || clinic.name,
          qualification: clinic.doctorQualification || 'Dental Surgeon',
          speciality: clinic.marketplaceProfile?.speciality || 'General Dentistry',
          available: true,
          schedule: { ...DEFAULT_SCHEDULE },
        }];
      } else {
        const verifiedDoctorIds = new Set(clinic.marketplaceVerifiedDoctorIds ?? []);
        try {
          verifiedDoctors = (await this.doctors.getDoctors(clinic.id)).filter(
            doctor => doctor.available && Boolean(doctor.id && verifiedDoctorIds.has(doctor.id)),
          );
        } catch (error) {
          console.error('[Marketplace] Booking doctors could not be loaded:', error);
        }
      }

      let services: Array<{ name: string; price?: string }> = [];
      const serviceIds = clinic.marketplaceProfile?.serviceIds ?? [];
      if (serviceIds.length > 0) {
        services = serviceIds.map(serviceId => {
          const name = this.marketplace.serviceLabel(serviceId);
          const clinicService = clinic.services?.find(
            service => service.name.trim().toLowerCase() === name.toLowerCase(),
          );
          return { name, price: clinicService?.price };
        });
      }
      if (services.length === 0 && clinic.services?.length) {
        services = clinic.services.map(s => ({ name: s.name, price: s.price }));
      }
      if (services.length === 0) {
        const fee = clinic.marketplaceProfile?.videoConsultationFee ?? clinic.marketplaceProfile?.consultationFee;
        services = [{
          name: 'Video Consultation',
          price: fee != null ? `₹${fee}` : undefined,
        }];
      }

      const address = [
        clinic.addressLine1,
        clinic.addressLine2,
        clinic.marketplaceProfile?.locality,
        clinic.city,
      ].filter(Boolean).join(', ');

      const clinicHours = clinic.hours ?? [];

      this.clinic.set(clinic);
      if (clinic.marketplaceProfile?.videoConsultationEnabled || clinic.isIndependent) {
        this.videoReady.set(await this.marketplace.videoAvailable());
      }
      if (clinic.isIndependent || this.route.snapshot.queryParamMap.get('mode') === 'video') {
        this.consultationMode.set('video');
        this.videoUnavailable.set(!clinic.isIndependent && (!clinic.marketplaceProfile?.videoConsultationEnabled || !this.videoReady()));
      }
      this.context.set({
        clinicId: clinic.id,
        isIndependent: clinic.isIndependent,
        bookingRefPrefix: clinic.bookingRefPrefix || 'MDP',
        displayName: clinic.name,
        phone: clinic.phone,
        phoneE164: clinic.phoneE164,
        whatsappNumber: clinic.whatsappNumber,
        address,
        hours: clinicHours,
        services,
        doctors: verifiedDoctors,
        isOpenNow: isClinicOpenAt(clinicHours),
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

  onSlotSelected(slot: SelectedSlot): void {
    this.selectedSlot.set(slot);
  }

  chooseMode(mode: 'in_person' | 'video'): void {
    if (mode === 'in_person' && this.isIndependent()) return;
    if (mode === 'video' && !this.isIndependent() && (!this.videoReady() || !this.clinic()?.marketplaceProfile?.videoConsultationEnabled)) return;
    if (mode !== this.consultationMode()) {
      this.selectedSlot.set(null);
      this.slotPicker()?.selectedSlotKey.set(null);
    }
    this.consultationMode.set(mode);
    this.videoUnavailable.set(false);
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
