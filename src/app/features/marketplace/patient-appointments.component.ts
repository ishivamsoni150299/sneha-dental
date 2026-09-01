import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  PatientAppointmentApiService,
  type PatientAppointmentSummary,
} from '../../core/services/patient-appointment-api.service';
import { PatientAuthService } from '../../core/services/patient-auth.service';
import { formatSlotDisplay } from '../../core/services/doctor.service';
import { formatLocalDateInput } from '../../core/utils/date-input';

type VerificationStep = 'phone' | 'code' | 'appointments';

@Component({
  selector: 'app-patient-appointments',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './patient-appointments.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientAppointmentsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  readonly patientAuth = inject(PatientAuthService);
  private readonly patientApi = inject(PatientAppointmentApiService);

  readonly step = signal<VerificationStep>('phone');
  readonly phoneMasked = signal('');
  readonly appointments = signal<PatientAppointmentSummary[]>([]);
  readonly loading = signal(false);
  readonly sendingCode = signal(false);
  readonly verifyingCode = signal(false);
  readonly claiming = signal(false);
  readonly mutatingId = signal<string | null>(null);
  readonly confirmCancelId = signal<string | null>(null);
  readonly rescheduleId = signal<string | null>(null);
  readonly rescheduleSlots = signal<string[]>([]);
  readonly loadingRescheduleSlots = signal(false);
  readonly error = signal<string | null>(null);
  readonly claimMessage = signal<string | null>(null);
  readonly formatSlotDisplay = formatSlotDisplay;
  readonly minDate = formatLocalDateInput();
  private availabilityRequest = 0;

  readonly phoneForm = this.fb.nonNullable.group({
    phone: ['', [Validators.required, Validators.pattern(/^[6-9]\d{9}$/)]],
  });
  readonly codeForm = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });
  readonly claimForm = this.fb.nonNullable.group({
    bookingRef: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9]{1,20}-[A-Za-z0-9]{8}$/)]],
  });
  readonly rescheduleForm = this.fb.nonNullable.group({
    date: ['', Validators.required],
    time: ['', Validators.required],
  });

  async ngOnInit(): Promise<void> {
    const claim = this.route.snapshot.queryParamMap.get('claim');
    if (claim) this.claimForm.controls.bookingRef.setValue(claim.toUpperCase());
    await this.patientAuth.ready;
    if (this.patientAuth.isSignedIn()) await this.loadSession();
  }

  async sendCode(): Promise<void> {
    this.phoneForm.markAllAsTouched();
    if (this.phoneForm.invalid || this.sendingCode()) return;
    this.sendingCode.set(true);
    this.error.set(null);
    try {
      this.phoneMasked.set(await this.patientAuth.sendVerificationCode(
        this.phoneForm.controls.phone.value,
        'patient-phone-recaptcha',
      ));
      this.step.set('code');
    } catch (error) {
      this.error.set(this.authError(error));
    } finally {
      this.sendingCode.set(false);
    }
  }

  async verifyCode(): Promise<void> {
    this.codeForm.markAllAsTouched();
    if (this.codeForm.invalid || this.verifyingCode()) return;
    this.verifyingCode.set(true);
    this.error.set(null);
    try {
      await this.patientAuth.confirmVerificationCode(this.codeForm.controls.code.value);
      await this.loadSession();
    } catch (error) {
      this.error.set(this.authError(error));
    } finally {
      this.verifyingCode.set(false);
    }
  }

  resetVerification(): void {
    this.patientAuth.resetVerification();
    this.codeForm.reset();
    this.error.set(null);
    this.step.set('phone');
  }

  async loadSession(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const session = await this.patientApi.session();
      this.phoneMasked.set(session.profile.phoneMasked);
      this.appointments.set(session.appointments);
      this.step.set('appointments');
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  normaliseBookingRef(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '');
    input.value = value;
    this.claimForm.controls.bookingRef.setValue(value, { emitEvent: false });
  }

  async claimBooking(): Promise<void> {
    this.claimForm.markAllAsTouched();
    if (this.claimForm.invalid || this.claiming()) return;
    this.claiming.set(true);
    this.error.set(null);
    this.claimMessage.set(null);
    try {
      const appointment = await this.patientApi.claim(this.claimForm.controls.bookingRef.value);
      this.replaceAppointment(appointment);
      this.claimForm.reset();
      this.claimMessage.set('Appointment linked to this verified number.');
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      this.claiming.set(false);
    }
  }

  async openReschedule(appointment: PatientAppointmentSummary): Promise<void> {
    this.confirmCancelId.set(null);
    this.rescheduleId.set(appointment.id);
    this.rescheduleForm.setValue({ date: appointment.date, time: appointment.time });
    this.error.set(null);
    await this.loadRescheduleAvailability();
  }

  onRescheduleDateChange(): void {
    this.rescheduleForm.controls.time.setValue('');
    void this.loadRescheduleAvailability();
  }

  closeReschedule(): void {
    this.availabilityRequest += 1;
    this.loadingRescheduleSlots.set(false);
    this.rescheduleSlots.set([]);
    this.rescheduleId.set(null);
  }

  async loadRescheduleAvailability(): Promise<void> {
    const appointmentId = this.rescheduleId();
    const date = this.rescheduleForm.controls.date.value;
    const request = ++this.availabilityRequest;
    this.rescheduleSlots.set([]);
    if (!appointmentId || !date) {
      this.loadingRescheduleSlots.set(false);
      return;
    }
    this.loadingRescheduleSlots.set(true);
    this.error.set(null);
    try {
      const slots = await this.patientApi.availability(appointmentId, date);
      if (request !== this.availabilityRequest) return;
      this.rescheduleSlots.set(slots);
      if (!slots.includes(this.rescheduleForm.controls.time.value)) {
        this.rescheduleForm.controls.time.setValue('');
      }
    } catch (error) {
      if (request === this.availabilityRequest) this.error.set(this.errorMessage(error));
    } finally {
      if (request === this.availabilityRequest) this.loadingRescheduleSlots.set(false);
    }
  }

  async saveReschedule(): Promise<void> {
    this.rescheduleForm.markAllAsTouched();
    const appointmentId = this.rescheduleId();
    if (!appointmentId || this.rescheduleForm.invalid || this.mutatingId()) return;
    this.mutatingId.set(appointmentId);
    this.error.set(null);
    try {
      const { date, time } = this.rescheduleForm.getRawValue();
      this.replaceAppointment(await this.patientApi.reschedule(appointmentId, date, time));
      this.closeReschedule();
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      this.mutatingId.set(null);
    }
  }

  async cancelAppointment(appointmentId: string): Promise<void> {
    if (this.mutatingId()) return;
    this.mutatingId.set(appointmentId);
    this.error.set(null);
    try {
      this.replaceAppointment(await this.patientApi.cancel(appointmentId));
      this.confirmCancelId.set(null);
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      this.mutatingId.set(null);
    }
  }

  async logout(): Promise<void> {
    await this.patientAuth.logout();
    this.appointments.set([]);
    this.phoneMasked.set('');
    this.step.set('phone');
  }

  canManage(appointment: PatientAppointmentSummary): boolean {
    return ['pending', 'confirmed'].includes(appointment.status);
  }

  canCancel(appointment: PatientAppointmentSummary): boolean {
    const scheduledAt = new Date(`${appointment.date}T${appointment.time}:00+05:30`);
    return this.canManage(appointment) && scheduledAt.getTime() - Date.now() > 24 * 60 * 60_000;
  }

  statusLabel(status: string): string {
    const labels: Record<string, string> = {
      pending: 'Awaiting clinic', confirmed: 'Confirmed', checked_in: 'Arrived',
      completed: 'Completed', no_show: 'No show', cancelled: 'Cancelled',
      declined: 'Declined', expired: 'Not confirmed',
    };
    return labels[status] ?? 'Status unavailable';
  }

  statusClass(status: string): string {
    const classes: Record<string, string> = {
      pending: 'bg-amber-100 text-amber-800', confirmed: 'bg-emerald-100 text-emerald-800',
      completed: 'bg-cyan-100 text-cyan-900', checked_in: 'bg-blue-100 text-blue-800',
      cancelled: 'bg-gray-200 text-gray-700', declined: 'bg-rose-100 text-rose-800',
      expired: 'bg-gray-200 text-gray-700', no_show: 'bg-gray-200 text-gray-700',
    };
    return classes[status] ?? 'bg-gray-100 text-gray-700';
  }

  formatDate(value: string): string {
    return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    });
  }

  private replaceAppointment(appointment: PatientAppointmentSummary): void {
    const next = this.appointments().filter(item => item.id !== appointment.id);
    this.appointments.set([appointment, ...next]);
  }

  private authError(error: unknown): string {
    const code = (error as { code?: string }).code ?? '';
    if (code === 'auth/invalid-verification-code') return 'That verification code is incorrect.';
    if (code === 'auth/code-expired' || code === 'auth/session-expired') return 'That code expired. Request a new one.';
    if (code === 'auth/too-many-requests' || code === 'auth/quota-exceeded') return 'Too many attempts. Please wait before trying again.';
    if (code === 'auth/network-request-failed') return 'Check your connection and try again.';
    return this.errorMessage(error);
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
  }
}