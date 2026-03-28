import { Component, signal, ChangeDetectionStrategy, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './contact.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactComponent {
  private fb = inject(FormBuilder);

  submitted = signal(false);
  submitting = signal(false);

  form = this.fb.group({
    name:    ['', [Validators.required, Validators.minLength(2)]],
    phone:   ['', [Validators.required, Validators.pattern(/^[6-9]\d{9}$/)]],
    email:   ['', Validators.email],
    message: ['', [Validators.required, Validators.minLength(10)]],
  });

  isInvalid(field: string) {
    const ctrl = this.form.get(field);
    return ctrl?.invalid && ctrl?.touched;
  }

  onSubmit() {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.submitting.set(true);
    setTimeout(() => {
      this.submitting.set(false);
      this.submitted.set(true);
    }, 800);
  }
}
