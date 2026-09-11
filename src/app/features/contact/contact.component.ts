import { Component, signal, ChangeDetectionStrategy, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DomSanitizer } from '@angular/platform-browser';
import type { SafeResourceUrl } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import { ClinicConfigService } from '../../core/services/clinic-config.service';
import { AnalyticsService } from '../../core/services/analytics.service';
const requiredValidator = Validators.required.bind(Validators);
const emailValidator = Validators.email.bind(Validators);

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './contact.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactComponent {
  readonly clinic     = inject(ClinicConfigService);
  readonly config     = this.clinic.config;
  readonly safeMapUrl: SafeResourceUrl = inject(DomSanitizer).bypassSecurityTrustResourceUrl(this.config.mapEmbedUrl);
  private readonly http = inject(HttpClient);
  private readonly analytics = inject(AnalyticsService);

  submitted  = signal(false);
  submitting = signal(false);
  sendError  = signal(false);

  private readonly fb = inject(FormBuilder);
  readonly form = this.fb.group({
    name:    ['', [requiredValidator, Validators.minLength(2)]],
    phone:   ['', [requiredValidator, Validators.pattern(/^[6-9]\d{9}$/)]],
    email:   ['', emailValidator],
    message: ['', [requiredValidator, Validators.minLength(10)]],
    privacyAccepted: [false, Validators.requiredTrue],
  });

  isInvalid(field: string): boolean {
    const ctrl = this.form.get(field);
    if (!ctrl) {
      return false;
    }
    return ctrl.invalid && ctrl.touched;
  }

  async onSubmit(): Promise<void> {
    if (this.submitting()) {
      return;
    }

    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.submitting.set(true);
    this.sendError.set(false);
    try {
      await firstValueFrom(this.http.post('/api/public/contacts', {
        clinicId:  this.config.clinicId,
        name:      this.form.value.name,
        phone:     this.form.value.phone,
        email:     this.form.value.email ?? null,
        message:   this.form.value.message,
        consentVersion: '2026-08-29',
      }));
      this.submitted.set(true);
      this.analytics.trackContactSubmitted({
        clinic_id: this.config.clinicId,
      });
      queueMicrotask(() => document.getElementById('contact-form-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch {
      this.sendError.set(true);
    } finally {
      this.submitting.set(false);
    }
  }

  sendAnotherMessage(): void {
    this.form.reset({
      name: '',
      phone: '',
      email: '',
      message: '',
      privacyAccepted: false,
    });
    this.sendError.set(false);
    this.submitted.set(false);
    queueMicrotask(() => document.getElementById('contact-name')?.focus());
  }
}
