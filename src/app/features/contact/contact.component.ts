import { Component, signal, ChangeDetectionStrategy, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ClinicConfigService } from '../../core/services/clinic-config.service';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './contact.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactComponent {
  readonly clinic     = inject(ClinicConfigService);
  readonly config     = this.clinic.config;
  readonly safeMapUrl: SafeResourceUrl = inject(DomSanitizer).bypassSecurityTrustResourceUrl(this.config.mapEmbedUrl);

  submitted  = signal(false);
  submitting = signal(false);

  private fb = inject(FormBuilder);
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
