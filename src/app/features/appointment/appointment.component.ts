import { Component, signal, ChangeDetectionStrategy, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

@Component({
  selector: 'app-appointment',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './appointment.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppointmentComponent {
  private fb = inject(FormBuilder);

  submitted = signal(false);
  submitting = signal(false);

  services = [
    'General Dentistry / Checkup',
    'Dental Cleaning & Scaling',
    'Tooth Filling',
    'Tooth Extraction',
    'Root Canal Treatment',
    'Cosmetic Dentistry',
    'Teeth Whitening',
    'Orthodontics (Braces)',
    'Dental Implants',
    'Other / Not Sure',
  ];

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

  onSubmit() {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.submitting.set(true);
    // Simulate async submission
    setTimeout(() => {
      this.submitting.set(false);
      this.submitted.set(true);
    }, 1000);
  }

  resetForm() {
    this.form.reset();
    this.submitted.set(false);
  }
}
