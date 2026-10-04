import { ChangeDetectionStrategy, Component, ElementRef, Injector, OnInit, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  isClinicOpenAt,
  type BookingClinicContext,
} from '../../core/services/appointment.service';
import { DoctorService, formatSlotDisplay, type Doctor } from '../../core/services/doctor.service';
import {
  AppointmentComponent,
  type BookingSubmission,
} from '../appointment/appointment.component';
import {
  MarketplaceService,
  type MarketplaceClinic,
} from '../../core/services/marketplace.service';
import { SlotPickerComponent, type SelectedSlot } from '../../shared/components/slot-picker/slot-picker.component';
import { PatientAuthService } from '../../core/services/patient-auth.service';
import { AnalyticsService } from '../../core/services/analytics.service';

@Component({
  selector: 'app-marketplace-booking',
  standalone: true,
  imports: [AppointmentComponent, RouterLink, SlotPickerComponent],
  templateUrl: './marketplace-booking.component.html',
  host: { class: 'booking-checkout' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarketplaceBookingComponent implements OnInit {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  readonly formatSlotDisplay = formatSlotDisplay;
  readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly marketplace = inject(MarketplaceService);
  private readonly doctors = inject(DoctorService);
  readonly patientAuth = inject(PatientAuthService);
  private readonly analytics = inject(AnalyticsService);
  readonly accountReady = signal(false);
  readonly accountQuery = computed(() => {
    const slot = this.selectedSlot();
    const returnUrl = this.router.serializeUrl(this.router.createUrlTree(['/dentists', this.route.snapshot.paramMap.get('slug'), 'book'], {
      queryParams: { mode: this.consultationMode(), date: slot?.date, time: slot?.time, doctorId: slot?.doctorId },
    }));
    return { returnUrl };
  });

  readonly clinic = signal<MarketplaceClinic | null>(null);
  readonly context = signal<BookingClinicContext | null>(null);
  readonly submission = signal<BookingSubmission | null>(null);
  readonly selectedSlot = signal<SelectedSlot | null>(null);
  readonly editingTime = signal(false);
  private readonly slotPicker = viewChild(SlotPickerComponent);
  readonly consultationMode = signal<'in_person' | 'video'>('in_person');
  readonly videoReady = signal(false);
  readonly videoUnavailable = signal(false);
  readonly isIndependent = computed(() => Boolean(this.clinic()?.isIndependent));
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
      const [clinic] = await Promise.all([this.marketplace.getVerifiedClinicBySlug(slug), this.patientAuth.ready]);
      this.accountReady.set(this.patientAuth.isSignedIn());
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
          schedule: (clinic.providerSchedule ?? {}) as Doctor['schedule'],
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
          name: clinic.isIndependent ? 'Video Consultation' : 'Dental Consultation',
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
        this.videoUnavailable.set(!this.videoReady() || (!clinic.isIndependent && !clinic.marketplaceProfile?.videoConsultationEnabled));
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
      this.analytics.trackBeginBooking({ consultation_mode: this.consultationMode() });
      const params = this.route.snapshot.queryParamMap;
      let date = params.get('date');
      let time = params.get('time');
      const doctorId = params.get('doctorId');
      const startsAt = params.get('startsAt');
      if (!date && startsAt) {
        const instant = new Date(startsAt);
        if (Number.isFinite(instant.getTime()) && instant.getTime() > Date.now()) {
          const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(instant);
          const part = (type: string) => parts.find(item => item.type === type)?.value ?? '';
          date = `${part('year')}-${part('month')}-${part('day')}`; time = `${part('hour')}:${part('minute')}`;
        }
      }
      if (date && /^\d{4}-\d{2}-\d{2}$/.test(date) && time && doctorId) {
        const availability = await this.marketplace.getAvailability(slug, 1, date);
        const slot = availability.days.find(day => day.date === date)?.slots.find(slot => slot.doctorId === doctorId && slot.time.slice(0, 5) === time?.slice(0, 5));
        if (slot) this.selectedSlot.set({ doctorId: slot.doctorId, doctorName: slot.doctorName, date, time: slot.time });
      }
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

  async switchAccount(): Promise<void> {
    await this.patientAuth.logout();
    await this.router.navigate(['/account'], { queryParams: this.accountQuery() });
  }

  onSlotSelected(slot: SelectedSlot): void {
    this.analytics.trackEvent('slot_selected', { consultation_mode: this.consultationMode() });
    this.selectedSlot.set(slot);
    this.editingTime.set(false);
    this.focusBookingStep(false);
  }

  setEditingTime(editing: boolean): void {
    this.editingTime.set(editing);
    this.focusBookingStep(editing);
  }

  private focusBookingStep(editing: boolean): void {
    afterNextRender(() => {
      const selector = editing ? '#booking-time-title' : '#quick-booking-title, #video-signin-heading';
      const heading = this.element.nativeElement.querySelector<HTMLElement>(selector);
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({ behavior: 'auto', block: 'start' });
    }, { injector: this.injector });
  }

  chooseMode(mode: 'in_person' | 'video'): void {
    if (mode === 'in_person' && this.isIndependent()) return;
    if (mode === 'video' && (!this.videoReady() || (!this.isIndependent() && !this.clinic()?.marketplaceProfile?.videoConsultationEnabled))) return;
    if (mode !== this.consultationMode()) {
      this.selectedSlot.set(null);
      this.slotPicker()?.selectedSlotKey.set(null);
    }
    this.consultationMode.set(mode);
    this.videoUnavailable.set(false);
  }

  formattedDate(value: string): string {
    return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', {
      weekday: this.consultationMode() === 'video' ? 'short' : 'long',
      day: 'numeric',
      month: this.consultationMode() === 'video' ? 'short' : 'long',
      year: this.consultationMode() === 'video' ? undefined : 'numeric',
    });
  }
}
