import { Component, signal, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormArray, FormGroup } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ClinicConfigService } from '../../../core/services/clinic-config.service';
import { ClinicFirestoreService } from '../../../core/services/clinic-firestore.service';
import { Testimonial, ClinicHours } from '../../../core/config/clinic.config';

type TabId = 'info' | 'contact' | 'hours' | 'testimonials' | 'social';

@Component({
  selector: 'app-admin-settings',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './admin-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSettingsComponent implements OnInit {
  private clinicCfg = inject(ClinicConfigService);
  private store     = inject(ClinicFirestoreService);
  private fb        = inject(FormBuilder);

  // ── State signals ─────────────────────────────────────────────────────────
  loading            = signal(true);
  activeTab          = signal<TabId>('info');
  savingInfo         = signal(false);
  savingContact      = signal(false);
  savingHours        = signal(false);
  savingTestimonials = signal(false);
  savingSocial       = signal(false);
  toast = signal<{ msg: string; type: 'success' | 'error' } | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  readonly tabs: Array<{ id: TabId; label: string }> = [
    { id: 'info',         label: 'Clinic Info' },
    { id: 'contact',      label: 'Contact' },
    { id: 'hours',        label: 'Hours' },
    { id: 'testimonials', label: 'Testimonials' },
    { id: 'social',       label: 'Social' },
  ];

  // ── Forms (one per tab) ───────────────────────────────────────────────────
  infoForm = this.fb.nonNullable.group({
    doctorName:          [''],
    doctorQualification: [''],
    doctorUniversity:    [''],
    patientCount:        [''],
    doctorBio:           [''],   // textarea — joined/split on load/save
  });

  contactForm = this.fb.nonNullable.group({
    phone:           [''],
    addressLine1:    [''],
    addressLine2:    [''],
    city:            [''],
    mapEmbedUrl:     [''],
    mapDirectionsUrl: [''],
  });

  hoursForm = this.fb.nonNullable.group({
    hours: this.fb.nonNullable.array<FormGroup>([]),
  });

  testimonialsForm = this.fb.nonNullable.group({
    testimonials: this.fb.nonNullable.array<FormGroup>([]),
  });

  socialForm = this.fb.nonNullable.group({
    facebook:  [''],
    instagram: [''],
    linkedin:  [''],
  });

  // ── FormArray getters ─────────────────────────────────────────────────────
  get hoursArr()        { return this.hoursForm.controls.hours as FormArray; }
  get testimonialsArr() { return this.testimonialsForm.controls.testimonials as FormArray; }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit() {
    const cfg = this.clinicCfg.config;

    this.infoForm.patchValue({
      doctorName:          cfg.doctorName ?? '',
      doctorQualification: cfg.doctorQualification ?? '',
      doctorUniversity:    cfg.doctorUniversity ?? '',
      patientCount:        cfg.patientCount ?? '',
      doctorBio:           (cfg.doctorBio ?? []).join('\n'),
    });

    this.contactForm.patchValue({
      phone:            cfg.phone ?? '',
      addressLine1:     cfg.addressLine1 ?? '',
      addressLine2:     cfg.addressLine2 ?? '',
      city:             cfg.city ?? '',
      mapEmbedUrl:      cfg.mapEmbedUrl ?? '',
      mapDirectionsUrl: cfg.mapDirectionsUrl ?? '',
    });

    (cfg.hours ?? []).forEach(h => this.addHour(h.days, h.time));
    (cfg.testimonials ?? []).forEach(t => this.addTestimonial(t));

    this.socialForm.patchValue({
      facebook:  cfg.social?.facebook  ?? '',
      instagram: cfg.social?.instagram ?? '',
      linkedin:  cfg.social?.linkedin  ?? '',
    });

    this.loading.set(false);
  }

  // ── FormArray helpers ─────────────────────────────────────────────────────
  addHour(days = '', time = '') {
    this.hoursArr.push(this.fb.nonNullable.group({ days: [days], time: [time] }));
  }
  removeHour(i: number) { this.hoursArr.removeAt(i); }

  addTestimonial(t?: Partial<Testimonial>) {
    this.testimonialsArr.push(this.fb.nonNullable.group({
      name:     [t?.name     ?? ''],
      location: [t?.location ?? ''],
      rating:   [t?.rating   ?? 5],
      review:   [t?.review   ?? ''],
    }));
  }
  removeTestimonial(i: number) { this.testimonialsArr.removeAt(i); }

  // ── clinicId (safe resolution) ────────────────────────────────────────────
  private get clinicId(): string {
    return this.clinicCfg.config.clinicId ?? '';
  }

  private guardClinicId(): boolean {
    if (!this.clinicId || this.clinicId === 'default') {
      this.showToast('Cannot save — clinic not fully configured.', 'error');
      return false;
    }
    return true;
  }

  // ── Save methods ──────────────────────────────────────────────────────────
  async saveInfo() {
    if (!this.guardClinicId()) return;
    this.savingInfo.set(true);
    try {
      const v = this.infoForm.getRawValue();
      await this.store.updateClinicSettings(this.clinicId, {
        doctorName:          v.doctorName,
        doctorQualification: v.doctorQualification,
        doctorUniversity:    v.doctorUniversity,
        patientCount:        v.patientCount,
        doctorBio:           v.doctorBio.split('\n').map(s => s.trim()).filter(Boolean),
      });
      this.showToast('Clinic info saved.', 'success');
    } catch { this.showToast('Failed to save. Please try again.', 'error'); }
    finally   { this.savingInfo.set(false); }
  }

  async saveContact() {
    if (!this.guardClinicId()) return;
    this.savingContact.set(true);
    try {
      const v      = this.contactForm.getRawValue();
      const digits = v.phone.replace(/\D/g, '');
      const e164   = digits.startsWith('91') ? digits : `91${digits}`;
      await this.store.updateClinicSettings(this.clinicId, {
        phone:           v.phone,
        phoneE164:       e164,
        whatsappNumber:  e164,
        addressLine1:    v.addressLine1,
        addressLine2:    v.addressLine2,
        city:            v.city,
        mapEmbedUrl:     v.mapEmbedUrl    || undefined,
        mapDirectionsUrl: v.mapDirectionsUrl || undefined,
      });
      this.showToast('Contact details saved.', 'success');
    } catch { this.showToast('Failed to save. Please try again.', 'error'); }
    finally   { this.savingContact.set(false); }
  }

  async saveHours() {
    if (!this.guardClinicId()) return;
    this.savingHours.set(true);
    try {
      await this.store.updateClinicSettings(this.clinicId, {
        hours: this.hoursForm.getRawValue().hours as ClinicHours[],
      });
      this.showToast('Clinic hours saved.', 'success');
    } catch { this.showToast('Failed to save. Please try again.', 'error'); }
    finally   { this.savingHours.set(false); }
  }

  async saveTestimonials() {
    if (!this.guardClinicId()) return;
    this.savingTestimonials.set(true);
    try {
      await this.store.updateClinicSettings(this.clinicId, {
        testimonials: this.testimonialsForm.getRawValue().testimonials as Testimonial[],
      });
      this.showToast('Testimonials saved.', 'success');
    } catch { this.showToast('Failed to save. Please try again.', 'error'); }
    finally   { this.savingTestimonials.set(false); }
  }

  async saveSocial() {
    if (!this.guardClinicId()) return;
    this.savingSocial.set(true);
    try {
      const v = this.socialForm.getRawValue();
      await this.store.updateClinicSettings(this.clinicId, {
        social: {
          ...(v.facebook  ? { facebook:  v.facebook  } : {}),
          ...(v.instagram ? { instagram: v.instagram } : {}),
          ...(v.linkedin  ? { linkedin:  v.linkedin  } : {}),
        },
      });
      this.showToast('Social links saved.', 'success');
    } catch { this.showToast('Failed to save. Please try again.', 'error'); }
    finally   { this.savingSocial.set(false); }
  }

  // ── Toast ─────────────────────────────────────────────────────────────────
  private showToast(msg: string, type: 'success' | 'error') {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast.set({ msg, type });
    this.toastTimer = setTimeout(() => this.toast.set(null), 2000);
  }
}
