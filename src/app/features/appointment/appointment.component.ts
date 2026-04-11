import { Component, signal, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import { AppointmentService } from '../../core/services/appointment.service';
import { ClinicConfigService } from '../../core/services/clinic-config.service';

@Component({
  selector: 'app-appointment',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './appointment.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppointmentComponent implements OnInit {
  private fb                 = inject(FormBuilder);
  private appointmentService = inject(AppointmentService);
  private router             = inject(Router);
  private route              = inject(ActivatedRoute);
  readonly clinic            = inject(ClinicConfigService);
  readonly config            = this.clinic.config;

  submitting = signal(false);
  error      = signal<string | null>(null);

  services  = [...this.config.services.map(s => s.name), 'Other / Not Sure'];
  timeSlots = ['Morning (9am - 12pm)', 'Afternoon (12pm - 4pm)', 'Evening (4pm - 8pm)'];

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

  ngOnInit() {
    // Pre-fill service from ?service= query param (e.g. from service cards)
    const preService = this.route.snapshot.queryParamMap.get('service');
    if (preService) {
      const match = this.services.find(s => s.toLowerCase() === preService.toLowerCase()) ?? preService;
      this.form.patchValue({ service: match });
    }
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
