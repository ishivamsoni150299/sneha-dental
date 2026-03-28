import {
  Component, signal, ChangeDetectionStrategy, inject, OnInit,
} from '@angular/core';
import {
  ReactiveFormsModule, FormBuilder, FormArray, FormGroup, Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  ClinicFirestoreService, StoredClinic,
} from '../../../core/services/clinic-firestore.service';

@Component({
  selector: 'app-clinic-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './clinic-form.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClinicFormComponent implements OnInit {
  private fb          = inject(FormBuilder);
  private clinicStore = inject(ClinicFirestoreService);
  private route       = inject(ActivatedRoute);
  private router      = inject(Router);

  loading  = signal(false);
  saving   = signal(false);
  error    = signal<string | null>(null);
  success  = signal(false);

  isEdit   = false;
  clinicId: string | null = null;

  // ── Form ──────────────────────────────────────────────────────────────────
  form = this.fb.nonNullable.group({
    // Identity
    name:                ['', Validators.required],
    doctorName:          ['', Validators.required],
    doctorQualification: ['', Validators.required],
    doctorUniversity:    [''],
    patientCount:        [''],

    // Contact
    phone:        ['', Validators.required],
    phoneE164:    ['', Validators.required],
    whatsappNumber: ['', Validators.required],
    addressLine1: ['', Validators.required],
    addressLine2: [''],
    city:         ['', Validators.required],
    mapEmbedUrl:  [''],
    mapDirectionsUrl: [''],

    // Platform
    domain: [''],
    active: [true],

    // Brand
    theme:            ['blue', Validators.required],
    bookingRefPrefix: ['', Validators.required],

    // Social
    facebook:  [''],
    instagram: [''],
    linkedin:  [''],

    // Arrays
    doctorBio:    this.fb.nonNullable.array<string>([]),
    hours:        this.fb.nonNullable.array<FormGroup>([]),
    services:     this.fb.nonNullable.array<FormGroup>([]),
    plans:        this.fb.nonNullable.array<FormGroup>([]),
    testimonials: this.fb.nonNullable.array<FormGroup>([]),
  });

  // ── FormArray getters ─────────────────────────────────────────────────────
  get doctorBioArr()    { return this.form.controls.doctorBio    as FormArray; }
  get hoursArr()        { return this.form.controls.hours        as FormArray; }
  get servicesArr()     { return this.form.controls.services     as FormArray; }
  get plansArr()        { return this.form.controls.plans        as FormArray; }
  get testimonialsArr() { return this.form.controls.testimonials as FormArray; }

  planFeaturesArr(planIndex: number): FormArray {
    return (this.plansArr.at(planIndex) as FormGroup).controls['features'] as FormArray;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  async ngOnInit() {
    this.clinicId = this.route.snapshot.paramMap.get('id');
    this.isEdit   = !!this.clinicId;

    if (this.isEdit) {
      this.loading.set(true);
      try {
        const clinic = await this.clinicStore.getById(this.clinicId!);
        if (clinic) this.patchForm(clinic);
        else this.error.set('Clinic not found.');
      } catch {
        this.error.set('Failed to load clinic data.');
      } finally {
        this.loading.set(false);
      }
    } else {
      // seed one empty row for each array
      this.addBio();
      this.addHour();
      this.addService();
      this.addPlan();
      this.addTestimonial();
    }
  }

  // ── Patch from Firestore ──────────────────────────────────────────────────
  private patchForm(c: StoredClinic) {
    this.form.patchValue({
      name: c.name, doctorName: c.doctorName,
      doctorQualification: c.doctorQualification,
      doctorUniversity: c.doctorUniversity ?? '',
      patientCount: c.patientCount ?? '',
      phone: c.phone, phoneE164: c.phoneE164,
      whatsappNumber: c.whatsappNumber,
      addressLine1: c.addressLine1, addressLine2: c.addressLine2 ?? '',
      city: c.city, mapEmbedUrl: c.mapEmbedUrl ?? '',
      mapDirectionsUrl: c.mapDirectionsUrl ?? '',
      domain: c.domain ?? '', active: c.active ?? true,
      theme: c.theme, bookingRefPrefix: c.bookingRefPrefix,
      facebook:  c.social?.facebook  ?? '',
      instagram: c.social?.instagram ?? '',
      linkedin:  c.social?.linkedin  ?? '',
    });

    (c.doctorBio ?? []).forEach(p => this.addBio(p));
    (c.hours ?? []).forEach(h => this.addHour(h.days, h.time));
    (c.services ?? []).forEach(s => this.addService(s));
    (c.plans ?? []).forEach(p => this.addPlan(p));
    (c.testimonials ?? []).forEach(t => this.addTestimonial(t));
  }

  // ── Add rows ──────────────────────────────────────────────────────────────
  addBio(value = '') {
    this.doctorBioArr.push(this.fb.nonNullable.control(value));
  }
  removeBio(i: number) { this.doctorBioArr.removeAt(i); }

  addHour(days = '', time = '') {
    this.hoursArr.push(this.fb.nonNullable.group({ days: [days], time: [time] }));
  }
  removeHour(i: number) { this.hoursArr.removeAt(i); }

  addService(s?: { iconPath?: string; name?: string; description?: string; benefit?: string; price?: string }) {
    this.servicesArr.push(this.fb.nonNullable.group({
      iconPath:    [s?.iconPath    ?? ''],
      name:        [s?.name        ?? '', Validators.required],
      description: [s?.description ?? ''],
      benefit:     [s?.benefit     ?? ''],
      price:       [s?.price       ?? ''],
    }));
  }
  removeService(i: number) { this.servicesArr.removeAt(i); }

  addPlan(p?: { tag?: string; name?: string; subtitle?: string; price?: string; period?: string; highlighted?: boolean; features?: string[] }) {
    const featArr = new FormArray(
      (p?.features ?? []).map(f => this.fb.nonNullable.control(f))
    );
    this.plansArr.push(this.fb.nonNullable.group({
      tag:         [p?.tag         ?? ''],
      name:        [p?.name        ?? '', Validators.required],
      subtitle:    [p?.subtitle    ?? ''],
      price:       [p?.price       ?? ''],
      period:      [p?.period      ?? '/year'],
      highlighted: [p?.highlighted ?? false],
      features:    featArr,
    }));
  }
  removePlan(i: number) { this.plansArr.removeAt(i); }

  addPlanFeature(planIndex: number, value = '') {
    this.planFeaturesArr(planIndex).push(this.fb.nonNullable.control(value));
  }
  removePlanFeature(planIndex: number, featureIndex: number) {
    this.planFeaturesArr(planIndex).removeAt(featureIndex);
  }

  addTestimonial(t?: { name?: string; location?: string; rating?: number; review?: string }) {
    this.testimonialsArr.push(this.fb.nonNullable.group({
      name:     [t?.name     ?? '', Validators.required],
      location: [t?.location ?? ''],
      rating:   [t?.rating   ?? 5],
      review:   [t?.review   ?? ''],
    }));
  }
  removeTestimonial(i: number) { this.testimonialsArr.removeAt(i); }

  // ── Submit ────────────────────────────────────────────────────────────────
  async onSubmit() {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.saving.set(true);
    this.error.set(null);

    try {
      const v = this.form.getRawValue();

      const payload = {
        name: v.name,
        doctorName: v.doctorName,
        doctorQualification: v.doctorQualification,
        doctorUniversity: v.doctorUniversity,
        patientCount: v.patientCount,
        phone: v.phone,
        phoneE164: v.phoneE164,
        whatsappNumber: v.whatsappNumber,
        addressLine1: v.addressLine1,
        addressLine2: v.addressLine2,
        city: v.city,
        mapEmbedUrl: v.mapEmbedUrl,
        mapDirectionsUrl: v.mapDirectionsUrl,
        domain: v.domain,
        active: v.active,
        theme: v.theme as 'blue' | 'teal' | 'caramel',
        bookingRefPrefix: v.bookingRefPrefix,
        social: {
          ...(v.facebook  ? { facebook:  v.facebook  } : {}),
          ...(v.instagram ? { instagram: v.instagram } : {}),
          ...(v.linkedin  ? { linkedin:  v.linkedin  } : {}),
        },
        doctorBio:    v.doctorBio as string[],
        hours:        v.hours    as { days: string; time: string }[],
        services:     v.services as StoredClinic['services'],
        plans:        (v.plans as Array<Record<string, unknown>>).map(p => ({
          ...p,
          features: p['features'] as string[],
        })) as StoredClinic['plans'],
        testimonials: v.testimonials as StoredClinic['testimonials'],
      };

      if (this.isEdit) {
        await this.clinicStore.update(this.clinicId!, payload);
      } else {
        await this.clinicStore.create(payload as Omit<StoredClinic, 'id' | 'createdAt'>);
      }

      this.success.set(true);
      setTimeout(() => this.router.navigate(['/business/clinics']), 1200);
    } catch {
      this.error.set('Failed to save. Please try again.');
    } finally {
      this.saving.set(false);
    }
  }
}
