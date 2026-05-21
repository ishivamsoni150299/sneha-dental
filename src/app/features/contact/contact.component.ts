import { Component, signal, ChangeDetectionStrategy, inject } from '@angular/core';
import { NgClass } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import type { SafeResourceUrl } from '@angular/platform-browser';
import { ClinicConfigService } from '../../core/services/clinic-config.service';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { environment } from '../../../environments/environment';

const app = getApps().length ? getApps()[0] : initializeApp(environment.firebase);
const db  = getFirestore(app);
const requiredValidator = Validators.required.bind(Validators);
const emailValidator = Validators.email.bind(Validators);

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [NgClass, ReactiveFormsModule],
  templateUrl: './contact.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactComponent {
  readonly clinic     = inject(ClinicConfigService);
  readonly config     = this.clinic.config;
  readonly safeMapUrl: SafeResourceUrl = inject(DomSanitizer).bypassSecurityTrustResourceUrl(this.config.mapEmbedUrl);

  submitted  = signal(false);
  submitting = signal(false);
  sendError  = signal(false);

  private readonly fb = inject(FormBuilder);
  readonly form = this.fb.group({
    name:    ['', [requiredValidator, Validators.minLength(2)]],
    phone:   ['', [requiredValidator, Validators.pattern(/^[6-9]\d{9}$/)]],
    email:   ['', emailValidator],
    message: ['', [requiredValidator, Validators.minLength(10)]],
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
      await addDoc(collection(db, 'contacts'), {
        clinicId:  this.config.clinicId ?? 'default',
        name:      this.form.value.name,
        phone:     this.form.value.phone,
        email:     this.form.value.email ?? null,
        message:   this.form.value.message,
        createdAt: serverTimestamp(),
      });
      this.submitted.set(true);
    } catch {
      this.sendError.set(true);
    } finally {
      this.submitting.set(false);
    }
  }
}
