import {
  Component, signal, ChangeDetectionStrategy, inject, OnInit, OnDestroy,
} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { AppointmentService } from '../../core/services/appointment.service';
import { ClinicConfigService } from '../../core/services/clinic-config.service';
import { DoctorService, Doctor, formatSlotDisplay } from '../../core/services/doctor.service';

@Component({
  selector: 'app-appointment',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './appointment.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppointmentComponent implements OnInit, OnDestroy {
  private fb                 = inject(FormBuilder);
  private appointmentService = inject(AppointmentService);
  private router             = inject(Router);
  private route              = inject(ActivatedRoute);
  private doctorSvc          = inject(DoctorService);
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
    fields.forEach(f => this.form.get(f)!.markAsTouched());
    const hasErrors = fields.some(f => this.form.get(f)!.invalid);
    if (hasErrors) return;
    if (step < this.totalSteps) {
      this.currentStep.set(step + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  prevStep() {
    const step = this.currentStep();
    if (step > 1) this.currentStep.set(step - 1);
  }

  isStepComplete(step: number): boolean {
    return (this.stepFields[step] ?? []).every(f => !this.form.get(f)!.invalid);
  }

  // ── Form state ────────────────────────────────────────────────────────────
  submitting = signal(false);
  error      = signal<string | null>(null);

  // ── Doctor state ──────────────────────────────────────────────────────────
  doctors          = signal<Doctor[]>([]);
  selectedDoctorId = signal<string>('');
  availableSlots   = signal<string[]>([]);
  slotsLoading     = signal(false);

  readonly formatSlotDisplay = formatSlotDisplay;

  services = [...this.config.services.map(s => s.name), 'Other / Not Sure'];

  /** Fallback time slots when no doctor is selected or no doctors configured. */
  readonly fallbackSlots = ['Morning (9am – 12pm)', 'Afternoon (12pm – 4pm)', 'Evening (4pm – 8pm)'];

  readonly nextSteps = [
    { text: 'Submit the form — takes under 60 seconds' },
    { text: 'We call you within 2 hours to confirm your slot' },
    { text: 'Save the booking reference sent to you' },
    { text: 'Arrive at your scheduled time — we\'ll be ready' },
    { text: 'Leave with a healthier, happier smile' },
  ];

  form = this.fb.group({
    name:    ['', [Validators.required, Validators.minLength(2)]],
    phone:   ['', [Validators.required, Validators.pattern(/^[6-9]\d{9}$/)]],
    email:   ['', [Validators.email]],
    service: ['', Validators.required],
    date:    ['', Validators.required],
    time:    ['', Validators.required],
    message: [''],
  });

  private subs = new Subscription();

  ngOnInit() {
    // Pre-fill service from ?service= query param
    const preService = this.route.snapshot.queryParamMap.get('service');
    if (preService) {
      const match = this.services.find(s => s.toLowerCase() === preService.toLowerCase()) ?? preService;
      this.form.patchValue({ service: match });
    }

    // Load doctors if clinic has a Firestore ID
    const clinicId = this.clinic.config.clinicId;
    if (clinicId) {
      this.doctorSvc.getDoctors(clinicId).then(docs => {
        this.doctors.set(docs.filter(d => d.available));
      }).catch(() => { /* silently fall back to time-range selection */ });
    }

    // When date or selected doctor changes, reload available slots
    this.subs.add(
      this.form.get('date')!.valueChanges.subscribe(() => void this.refreshSlots())
    );
  }

  ngOnDestroy() { this.subs.unsubscribe(); }

  selectDoctor(doctorId: string) {
    this.selectedDoctorId.set(doctorId);
    this.form.patchValue({ time: '' }); // clear time when switching doctor
    void this.refreshSlots();
  }

  private async refreshSlots() {
    const doctorId = this.selectedDoctorId();
    const date     = this.form.get('date')!.value;
    if (!doctorId || !date) { this.availableSlots.set([]); return; }

    const doctor = this.doctors().find(d => d.id === doctorId);
    if (!doctor) return;

    this.slotsLoading.set(true);
    try {
      const slots = await this.doctorSvc.getAvailableSlots(
        this.clinic.config.clinicId!, doctor, date
      );
      this.availableSlots.set(slots);
    } catch {
      this.availableSlots.set([]);
    } finally {
      this.slotsLoading.set(false);
    }
  }

  get selectedDoctor(): Doctor | undefined {
    return this.doctors().find(d => d.id === this.selectedDoctorId());
  }

  get timeSlots(): string[] {
    // Show doctor's specific slots when available, else fallback
    const slots = this.availableSlots();
    if (this.selectedDoctorId() && slots.length > 0) return slots;
    return this.fallbackSlots;
  }

  doctorInitials(name: string): string {
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  get minDate() {
    return new Date().toISOString().split('T')[0];
  }

  isInvalid(field: string) {
    const ctrl = this.form.get(field);
    return ctrl?.invalid && ctrl?.touched;
  }

  get whatsappUrl(): string {
    const { name, service, date } = this.form.value;
    let msg = `Hi ${this.config.name}! `;
    if (name)    msg += `My name is ${name}. `;
    if (service) msg += `I would like to book for ${service}. `;
    if (date)    msg += `Preferred date: ${date}. `;
    msg += 'Please confirm an available slot.';
    return this.clinic.whatsappUrl(msg);
  }

  async onSubmit() {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.submitting.set(true);
    this.error.set(null);

    try {
      const val    = this.form.value;
      const doctor = this.selectedDoctor;
      const ref    = await this.appointmentService.bookAppointment({
        name:       val.name!,
        phone:      val.phone!,
        email:      val.email || undefined,
        service:    val.service!,
        date:       val.date!,
        time:       val.time!,
        doctorId:   doctor?.id,
        doctorName: doctor?.name,
        message:    val.message || undefined,
      });
      this.router.navigate(['/appointment/confirmed'], {
        queryParams: {
          ref,
          name:    val.name,
          date:    val.date,
          service: val.service,
        },
      });
    } catch (e) {
      console.error('[Appointment] Booking failed:', e);
      this.error.set('Something went wrong. Please try again or WhatsApp us.');
    } finally {
      this.submitting.set(false);
    }
  }
}
