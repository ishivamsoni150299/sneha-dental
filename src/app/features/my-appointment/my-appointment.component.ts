import { Component, signal, ChangeDetectionStrategy, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AppointmentService, Appointment } from '../../core/services/appointment.service';
import { ClinicConfigService } from '../../core/services/clinic-config.service';
import { DEFAULT_BOOKING_SLOTS, formatSlotDisplay } from '../../core/services/doctor.service';

type View = 'lookup' | 'detail' | 'edit' | 'cancelled';

@Component({
  selector: 'app-my-appointment',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './my-appointment.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyAppointmentComponent {
  private fb = inject(FormBuilder);
  private appointmentService = inject(AppointmentService);
  readonly config = inject(ClinicConfigService).config;
  private prefix = this.config.bookingRefPrefix;

  view        = signal<View>('lookup');
  appointment = signal<Appointment | null>(null);
  loading     = signal(false);
  lookupError = signal<string | null>(null);
  saveError   = signal<string | null>(null);
  saving      = signal(false);
  cancelling  = signal(false);
  showConfirm = signal(false);
  readonly formatSlotDisplay = formatSlotDisplay;

  services = [...this.config.services.map(s => s.name), 'Other / Not Sure'];
  timeSlots = DEFAULT_BOOKING_SLOTS;

  lookupForm = this.fb.group({
    bookingRef: ['', [Validators.required, Validators.pattern(new RegExp(`^${this.prefix}-[A-Z0-9]{8}$`))]],
    phone:      ['', [Validators.required, Validators.pattern(/^[6-9]\d{9}$/)]],
  });

  editForm = this.fb.group({
    service: ['', Validators.required],
    date:    ['', Validators.required],
    time:    ['', Validators.required],
    message: [''],
  });

  get minDate() {
    return new Date().toISOString().split('T')[0];
  }

  get supportWhatsappUrl(): string {
    return this.config.whatsappNumber
      ? `https://wa.me/${this.config.whatsappNumber}?text=${encodeURIComponent('Hi! I need help with my appointment booking.')}`
      : '';
  }

  get supportPhoneHref(): string {
    return this.config.phoneE164 ? `tel:+${this.config.phoneE164}` : '';
  }

  get clinicHoursPreview(): string {
    const firstHours = this.config.hours[0];
    return firstHours ? `${firstHours.days}: ${firstHours.time}` : 'Call us for the latest clinic hours.';
  }

  isLookupInvalid(field: string) {
    const ctrl = this.lookupForm.get(field);
    return ctrl?.invalid && ctrl?.touched;
  }

  isEditInvalid(field: string) {
    const ctrl = this.editForm.get(field);
    return ctrl?.invalid && ctrl?.touched;
  }

  canCancel(): boolean {
    const appt = this.appointment();
    return appt
      ? ['pending', 'confirmed'].includes(appt.status) && this.appointmentService.canCancel(appt.date)
      : false;
  }

  canEdit(): boolean {
    const appt = this.appointment();
    return appt ? ['pending', 'confirmed'].includes(appt.status) : false;
  }

  async onLookup() {
    this.lookupForm.markAllAsTouched();
    if (this.lookupForm.invalid) return;

    this.loading.set(true);
    this.lookupError.set(null);

    try {
      const { bookingRef, phone } = this.lookupForm.value;
      const appt = await this.appointmentService.getAppointmentByRef(bookingRef!, phone!);
      if (!appt) {
        this.lookupError.set('No appointment found. Please check your booking reference and phone number.');
        return;
      }
      this.appointment.set(appt);
      this.view.set('detail');
    } catch (e) {
      console.error('[MyAppointment] Lookup failed:', e);
      this.lookupError.set('Something went wrong. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }

  openEdit() {
    const appt = this.appointment()!;
    this.editForm.patchValue({
      service: appt.service,
      date:    appt.date,
      time:    appt.time,
      message: appt.message ?? '',
    });
    this.saveError.set(null);
    this.view.set('edit');
  }

  async onSave() {
    this.editForm.markAllAsTouched();
    if (this.editForm.invalid) return;

    this.saving.set(true);
    this.saveError.set(null);

    try {
      const appt = this.appointment()!;
      const val  = this.editForm.value;
      await this.appointmentService.updateAppointment(appt, {
        service: val.service!,
        date:    val.date!,
        time:    val.time!,
        message: val.message || undefined,
      });
      this.appointment.set({
        ...appt,
        service: val.service!,
        date: val.date!,
        time: val.time!,
        message: val.message || undefined,
        status: 'pending',
      });
      this.view.set('detail');
    } catch (e) {
      console.error('[MyAppointment] Update failed:', e);
      this.saveError.set('Could not update appointment. Please try again.');
    } finally {
      this.saving.set(false);
    }
  }

  async onCancelConfirmed() {
    const appt = this.appointment()!;
    this.cancelling.set(true);
    this.showConfirm.set(false);

    try {
      await this.appointmentService.cancelAppointment(appt);
      this.view.set('cancelled');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : `Could not cancel. Please call ${this.config.phone}.`;
      this.saveError.set(msg);
    } finally {
      this.cancelling.set(false);
    }
  }

  backToLookup() {
    this.lookupForm.reset();
    this.appointment.set(null);
    this.lookupError.set(null);
    this.saveError.set(null);
    this.view.set('lookup');
  }

  formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }
}
