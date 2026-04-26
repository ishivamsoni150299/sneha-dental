import { Component, signal, ChangeDetectionStrategy, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ClinicConfigService } from '../../core/services/clinic-config.service';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { environment } from '../../../environments/environment';

const app = getApps().length ? getApps()[0] : initializeApp(environment.firebase);
const db  = getFirestore(app);

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
  sendError  = signal(false);

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

  async onSubmit() {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.submitting.set(true);
    this.sendError.set(false);
    try {
      await addDoc(collection(db, 'contacts'), {
        clinicId:  this.config.clinicId ?? 'default',
        name:      this.form.value.name,
        phone:     this.form.value.phone,
        email:     this.form.value.email || null,
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
