import { Component, signal, ChangeDetectionStrategy, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AppointmentService } from '../../core/services/appointment.service';
import { ClinicConfigService } from '../../core/services/clinic-config.service';

@Component({
  selector: 'app-appointment',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './appointment.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppointmentComponent {
  private fb = inject(FormBuilder);
  private appointmentService = inject(AppointmentService);
  readonly clinic = inject(ClinicConfigService);
  readonly config = this.clinic.config;

  submitted  = signal(false);
  submitting = signal(false);
  error      = signal<string | null>(null);
  bookingRef = signal<string | null>(null);

  services  = [...this.config.services.map(s => s.name), 'Other / Not Sure'];
  timeSlots = ['Morning (9am - 12pm)', 'Afternoon (12pm - 4pm)', 'Evening (4pm - 8pm)'];

  form = this.fb.group({
    name:    ['', [Validators.required, Validators.minLength(2)]],
    phone:   ['', [Validators.required, Validators.pattern(/^[6-9]\d{9}$/)]],
    email:   ['', [Validators.email]],
    service: ['', Validators.required],
    date:    ['', Validators.required],
    time:    ['', Validators.required],
    message: [''],
  });

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

  get confirmationWhatsappUrl(): string {
    const msg = `Hi ${this.config.name}! I just booked an appointment. My name is ${this.form.value.name ?? ''} and my Booking Ref is ${this.bookingRef()}. Please confirm my slot. Thank you!`;
    return this.clinic.whatsappUrl(msg);
  }

  async onSubmit() {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.submitting.set(true);
    this.error.set(null);

    try {
      const val = this.form.value;
      const ref = await this.appointmentService.bookAppointment({
        name:    val.name!,
        phone:   val.phone!,
        email:   val.email || undefined,
        service: val.service!,
        date:    val.date!,
        time:    val.time!,
        message: val.message || undefined,
      });
      this.bookingRef.set(ref);
      this.submitted.set(true);
    } catch {
      this.error.set('Something went wrong. Please try again or WhatsApp us.');
    } finally {
      this.submitting.set(false);
    }
  }

  resetForm() {
    this.form.reset();
    this.submitted.set(false);
    this.bookingRef.set(null);
    this.error.set(null);
  }
}
