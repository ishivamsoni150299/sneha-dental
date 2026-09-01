import { DecimalPipe, DOCUMENT, NgClass } from '@angular/common';
import type { OnDestroy, OnInit } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
  signal,
} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  AppointmentService,
  type BookingClinicContext,
} from '../../core/services/appointment.service';
import { ClinicConfigService } from '../../core/services/clinic-config.service';
import type { Doctor } from '../../core/services/doctor.service';
import {
  DoctorService,
  DEFAULT_BOOKING_SLOTS,
  filterBookableSlots,
  formatSlotDisplay,
  isPastDate,
} from '../../core/services/doctor.service';
import { formatLocalDateInput } from '../../core/utils/date-input';
import { PatientAuthService } from '../../core/services/patient-auth.service';

export interface BookingSubmission {
  ref: string;
  name: string;
  date: string;
  time: string;
  service: string;
}

@Component({
  selector: 'app-appointment',
  standalone: true,
  imports: [DecimalPipe, NgClass, ReactiveFormsModule, RouterLink],
  templateUrl: './appointment.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppointmentComponent implements OnInit, OnDestroy {
  @Input() bookingContext: BookingClinicContext | null = null;
  @Output() readonly bookingCompleted = new EventEmitter<BookingSubmission>();

  private readonly fb                 = inject(FormBuilder);
  private readonly appointmentService = inject(AppointmentService);
  private readonly document           = inject(DOCUMENT);
  private readonly router             = inject(Router);
  private readonly route              = inject(ActivatedRoute);
  private readonly doctorSvc          = inject(DoctorService);
  private readonly patientAuth        = inject(PatientAuthService);
  readonly clinic            = inject(ClinicConfigService);
  readonly config            = this.clinic.config;

  // ── Multi-step form state ─────────────────────────────────────────────────
  currentStep = signal<number>(1);
  readonly totalSteps = 3;

  readonly stepLabels = [
    { num: 1, title: 'Service & Schedule', short: 'Service' },
    { num: 2, title: 'Your Details',       short: 'Details' },
    { num: 3, title: 'Confirm & Book',     short: 'Confirm' },
  ];

  /** Fields that must be valid before advancing from each step */
  private readonly stepFields: Record<number, string[]> = {
    1: ['service', 'date', 'time'],
    2: ['name', 'phone'],
    3: [],
  };

  nextStep() {
    const step = this.currentStep();
    const fields = this.stepFields[step] ?? [];
    fields.forEach(f => { this.form.get(f)!.markAsTouched(); });
    const hasErrors = fields.some(f => this.form.get(f)!.invalid);
    if (hasErrors) {
      this.focusFirstInvalidField(fields);
      return;
    }
    if (step < this.totalSteps) {
      this.currentStep.set(step + 1);
      this.scrollToBookingForm();
    }
  }

  prevStep() {
    const step = this.currentStep();
    if (step > 1) {
      this.currentStep.set(step - 1);
      this.scrollToBookingForm();
    }
  }

  goToStep(target: number) {
    // Only allow jumping back to a completed step
    if (target < this.currentStep() && target >= 1) {
      this.currentStep.set(target);
      this.scrollToBookingForm();
    }
  }

  isStepComplete(step: number): boolean {
    return (this.stepFields[step] ?? []).every(f => !this.form.get(f)!.invalid);
  }

  // ── Form state ────────────────────────────────────────────────────────────
  submitting = signal(false);
  error      = signal<string | null>(null);

  // ── Doctor state ──────────────────────────────────────────────────────────
  doctors          = signal<Doctor[]>([]);
  doctorsLoading   = signal(true);
  selectedDoctorId = signal<string>('');
  availableSlots   = signal<string[]>([]);
  slotsLoading     = signal(false);

  readonly formatSlotDisplay = formatSlotDisplay;

  get services(): string[] {
    const services = this.bookingContext?.services ?? this.config.services;
    return [...services.map(service => service.name), 'Other / Not Sure'];
  }

  get clinicDisplayName(): string {
    return this.bookingContext?.displayName ?? this.clinic.displayName;
  }

  get isClinicOpenNow(): boolean {
    return this.bookingContext?.isOpenNow ?? this.clinic.isOpenNow;
  }

  get hasWhatsapp(): boolean {
    return Boolean(this.bookingContext?.whatsappNumber ?? (this.clinic.hasWhatsapp ? this.config.whatsappNumber : ''));
  }

  get whatsappNumber(): string {
    return this.bookingContext?.whatsappNumber ?? this.config.whatsappNumber;
  }

  get clinicHours() {
    return this.bookingContext?.hours ?? this.config.hours;
  }

  get isMarketplaceBooking(): boolean {
    return this.bookingContext?.source === 'marketplace';
  }

  get privacyRoute(): string {
    return this.isMarketplaceBooking ? '/business/privacy' : '/privacy';
  }

  get termsRoute(): string {
    return this.isMarketplaceBooking ? '/business/terms' : '/terms';
  }

  /** Fallback time slots when no doctor is selected or no doctors configured. */
  readonly fallbackSlots = DEFAULT_BOOKING_SLOTS;

  readonly nextSteps = [
    { text: 'Submit the form in under 60 seconds' },
    { text: 'We call you within 2 hours to confirm your slot' },
    { text: 'Arrive at your scheduled time with your booking reference' },
  ];

  readonly quickDates = Array.from({ length: 3 }, (_, offset) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return {
      value: formatLocalDateInput(date),
      label: offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : date.toLocaleDateString('en-IN', { weekday: 'short' }),
      meta: date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
    };
  });

  form = this.fb.group({
    name:    ['', [Validators.required, Validators.minLength(2)]],
    phone:   ['', [Validators.required, Validators.pattern(/^[6-9]\d{9}$/)]],
    email:   ['', [Validators.email]],
    service: ['', Validators.required],
    date:    ['', Validators.required],
    time:    ['', Validators.required],
    message: [''],
    privacyAccepted: [false, Validators.requiredTrue],
  });

  private readonly subs = new Subscription();

  ngOnInit() {
    // Pre-fill service from ?service= query param
    const preService = this.route.snapshot.queryParamMap.get('service');
    if (preService) {
      const match = this.services.find(s => s.toLowerCase() === preService.toLowerCase()) ?? preService;
      this.form.patchValue({ service: match });
    }

    if (this.bookingContext) {
      this.doctors.set(this.bookingContext.doctors.filter(doctor => doctor.available));
      this.doctorsLoading.set(false);
    }

    // Clinic-domain routes load their doctors here. Marketplace doctors arrive
    // through the explicit booking context instead.
    const clinicId = this.bookingContext ? null : this.clinic.config.clinicId;
    if (clinicId) {
      this.doctorSvc.getDoctors(clinicId).then(docs => {
        this.doctors.set(docs.filter(d => d.available));
      }).catch(() => { /* silently fall back to time-range selection */ }).finally(() => {
        this.doctorsLoading.set(false);
      });
    } else {
      this.doctorsLoading.set(false);
    }

    // When date or selected doctor changes, reload available slots
    this.subs.add(
      this.form.get('date')!.valueChanges.subscribe(() => {
        this.form.patchValue({ time: '' }, { emitEvent: false });
        this.validateScheduleFields();
        void this.refreshSlots();
      })
    );

    this.subs.add(
      this.form.get('time')!.valueChanges.subscribe(() => { this.validateScheduleFields(); })
    );
  }

  ngOnDestroy() { this.subs.unsubscribe(); }

  onDoctorSelectionChange(event: Event): void {
    this.selectDoctor((event.target as HTMLSelectElement).value);
  }

  selectDoctor(doctorId: string) {
    this.selectedDoctorId.set(doctorId);
    this.form.patchValue({ time: '' }); // clear time when switching doctor
    this.validateScheduleFields();
    void this.refreshSlots();
  }

  selectQuickDate(date: string): void {
    this.form.get('date')?.setValue(date);
    this.form.get('date')?.markAsTouched();
  }

  private async refreshSlots() {
    const doctorId = this.selectedDoctorId();
    const date     = this.form.get('date')!.value;
    if (!doctorId || !date) {
      this.availableSlots.set([]);
      this.validateScheduleFields();
      return;
    }

    const doctor = this.doctors().find(d => d.id === doctorId);
    if (!doctor) return;

    this.slotsLoading.set(true);
    try {
      const slots = await this.doctorSvc.getAvailableSlots(
        this.bookingContext?.clinicId ?? this.clinic.config.clinicId!, doctor, date
      );
      this.availableSlots.set(slots);
    } catch {
      this.availableSlots.set([]);
    } finally {
      this.slotsLoading.set(false);
      this.validateScheduleFields();
    }
  }

  get selectedDoctor(): Doctor | undefined {
    return this.doctors().find(d => d.id === this.selectedDoctorId());
  }

  get timeSlots(): string[] {
    // Show doctor's specific slots when available, else fallback
    const slots = this.availableSlots();
    if (this.selectedDoctorId() && slots.length > 0) return slots;
    const date = String(this.form.get('date')?.value ?? '');
    return date ? filterBookableSlots(date, this.fallbackSlots) : this.fallbackSlots;
  }

  get selectedServiceLabel(): string {
    return String(this.form.get('service')?.value || 'Choose a service');
  }

  get selectedServicePrice(): string {
    const name = this.form.get('service')?.value;
    if (!name) return '';
    const services = this.bookingContext?.services ?? this.config.services;
    return services.find(service => service.name === name)?.price ?? '';
  }

  get selectedDateLabel(): string {
    const value = this.form.get('date')?.value;
    if (!value) return 'Pick a preferred date';
    return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  }

  get selectedTimeLabel(): string {
    const value = this.form.get('time')?.value;
    if (!value) return 'Select a time';
    return formatSlotDisplay(String(value));
  }

  get selectedDoctorLabel(): string {
    return this.selectedDoctor?.name || 'First available doctor';
  }

  get confirmationWindowLabel(): string {
    return this.isClinicOpenNow ? 'Within 2 working hours' : 'Next working window';
  }

  doctorInitials(name: string): string {
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  get minDate() {
    return formatLocalDateInput();
  }

  isInvalid(field: string) {
    const ctrl = this.form.get(field);
    return ctrl?.invalid && ctrl?.touched;
  }

  private focusFirstInvalidField(fields: readonly string[]): void {
    for (const fieldName of fields) {
      if (!this.form.get(fieldName)?.invalid) continue;

      const field = this.document.getElementById(`appointment-${fieldName}`);
      if (!field) continue;

      field.closest('details')?.setAttribute('open', '');
      field.focus({ preventScroll: true });
      field.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
  }

  private scrollToBookingForm(): void {
    this.document.getElementById('appointment-booking-form')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }

  private validateScheduleFields() {
    const dateCtrl = this.form.get('date');
    const timeCtrl = this.form.get('time');
    if (!dateCtrl || !timeCtrl) return;

    const date = String(dateCtrl.value ?? '');
    const time = String(timeCtrl.value ?? '');

    if (date && isPastDate(date)) {
      dateCtrl.setErrors({ ...(dateCtrl.errors ?? {}), pastDate: true });
    } else if (dateCtrl.errors?.['pastDate']) {
      const rest = { ...dateCtrl.errors };
      delete rest['pastDate'];
      dateCtrl.setErrors(Object.keys(rest).length ? rest : null);
    }

    const slotOptions = this.timeSlots;
    if (time && date && !slotOptions.includes(time)) {
      timeCtrl.setErrors({ ...(timeCtrl.errors ?? {}), pastTime: true });
    } else if (timeCtrl.errors?.['pastTime']) {
      const rest = { ...timeCtrl.errors };
      delete rest['pastTime'];
      timeCtrl.setErrors(Object.keys(rest).length ? rest : null);
    }
  }

  get whatsappUrl(): string {
    const { name, service, date } = this.form.value;
    let msg = `Hi ${this.clinicDisplayName}! `;
    if (name)    msg += `My name is ${name}. `;
    if (service) msg += `I would like to book for ${service}. `;
    if (date)    msg += `Preferred date: ${date}. `;
    msg += 'Please confirm an available slot.';
    return this.bookingContext
      ? `https://wa.me/${this.whatsappNumber}?text=${encodeURIComponent(msg)}`
      : this.clinic.whatsappUrl(msg);
  }

  async onSubmit() {
    if (this.submitting()) {
      return;
    }

    this.form.markAllAsTouched();
    this.validateScheduleFields();
    if (this.form.invalid) {
      this.focusFirstInvalidField([
        'service', 'date', 'time', 'name', 'phone', 'email', 'privacyAccepted',
      ]);
      return;
    }

    this.submitting.set(true);
    this.error.set(null);

    try {
      const val = this.form.value;
      const doctor = this.selectedDoctor;
      const ref = await this.appointmentService.bookAppointment({
        name:       val.name!,
        phone:      val.phone!,
        email:      val.email || undefined,
        service:    val.service!,
        date:       val.date!,
        time:       val.time!,
        doctorId:   doctor?.id,
        doctorName: doctor?.name,
        message:    val.message || undefined,
        patientUid: this.patientAuth.matchingPatientUid(val.phone!),
      }, this.bookingContext ?? undefined);
      const submission: BookingSubmission = {
        ref,
        name: val.name!,
        date: val.date!,
        time: val.time!,
        service: val.service!,
      };
      if (this.bookingContext) {
        this.bookingCompleted.emit(submission);
        return;
      }
      void this.router.navigate(['/appointment/confirmed'], {
        queryParams: submission,
      });
    } catch (e) {
      console.error('[Appointment] Booking failed:', e);
      const message = e instanceof Error && e.message
        ? e.message
        : 'Something went wrong. Please try again or WhatsApp us.';
      this.error.set(message);
    } finally {
      this.submitting.set(false);
    }
  }
}
