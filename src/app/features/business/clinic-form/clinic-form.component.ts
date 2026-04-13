import {
  Component, signal, ChangeDetectionStrategy, inject, OnInit, OnDestroy,
} from '@angular/core';
import { Subscription } from 'rxjs';
import {
  ReactiveFormsModule, FormBuilder, FormArray, FormGroup, Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  ClinicFirestoreService, StoredClinic,
} from '../../../core/services/clinic-firestore.service';
import { PLATFORM_PLANS } from '../../../core/config/clinic.config';

// TODO: Uncomment when Google Maps API key is ready in environment.ts
// import { environment } from '../../../../environments/environment';
// let _mapsApiPromise: Promise<void> | null = null;
// function loadGoogleMapsScript(apiKey: string): Promise<void> {
//   if (_mapsApiPromise) return _mapsApiPromise;
//   _mapsApiPromise = new Promise((resolve, reject) => {
//     if ((window as any).google?.maps?.places) { resolve(); return; }
//     const s = document.createElement('script');
//     s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
//     s.onload  = () => resolve();
//     s.onerror = () => { _mapsApiPromise = null; reject(new Error('Maps API load failed')); };
//     document.head.appendChild(s);
//   });
//   return _mapsApiPromise;
// }

@Component({
  selector: 'app-clinic-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './clinic-form.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClinicFormComponent implements OnInit, OnDestroy {
  private readonly _subs = new Subscription();
  private fb          = inject(FormBuilder);
  private clinicStore = inject(ClinicFirestoreService);
  private route       = inject(ActivatedRoute);
  private router      = inject(Router);
  // private ngZone   = inject(NgZone); // TODO: Uncomment with Google Maps API

  readonly platformPlans = PLATFORM_PLANS;

  loading   = signal(false);
  saving    = signal(false);
  error     = signal<string | null>(null);
  success   = signal(false);
  // syncing   = signal(false);   // TODO: Uncomment with Google Maps API
  // syncError = signal<string | null>(null);

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
    phone:            ['', Validators.required],
    phoneE164:        [''],   // auto-filled from phone — not shown to user
    whatsappNumber:   [''],   // auto-filled from phone — not shown to user
    addressLine1:     ['', Validators.required],
    addressLine2:     [''],
    city:             ['', Validators.required],
    mapEmbedUrl:      [''],
    mapDirectionsUrl: [''],

    // Platform
    googlePlaceId: [''],
    domain:        [''],
    vercelDomain:  [''],
    active:        [true],

    // Subscription & Billing
    subscriptionPlan:    ['trial'],
    subscriptionStatus:  ['trial'],
    billingCycle:        ['monthly'],
    trialEndDate:        [''],
    subscriptionEndDate: [''],
    lastPaymentDate:     [''],
    lastPaymentAmount:   [0],
    lastPaymentRef:      [''],
    billingEmail:        [''],
    billingNotes:        [''],

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

  // ── Star rating helpers (testimonials) ────────────────────────────────────
  readonly STARS = [1, 2, 3, 4, 5] as const;
  getStars(i: number): number {
    return (this.testimonialsArr.at(i) as FormGroup).get('rating')?.value as number ?? 5;
  }
  setStars(i: number, stars: number) {
    (this.testimonialsArr.at(i) as FormGroup).get('rating')!.setValue(stars);
  }

  // ── Field error helper ────────────────────────────────────────────────────
  hasErr(ctrl: { invalid: boolean; touched: boolean }): boolean {
    return ctrl.invalid && ctrl.touched;
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

      // Default trial: starts today, ends in 30 days
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 30);
      this.form.controls.trialEndDate.setValue(trialEnd.toISOString().split('T')[0]);
      this.form.controls.subscriptionPlan.setValue('trial');
      this.form.controls.subscriptionStatus.setValue('trial');
    }

    this.setupAutoFills();
  }

  // ── Auto-fill helpers ─────────────────────────────────────────────────────

  /** Strips formatting from phone and auto-updates phoneE164 + whatsappNumber */
  private setupAutoFills() {
    this._subs.add(this.form.controls.phone.valueChanges.subscribe(val => {
      if (!val) return;
      const digits = val.replace(/\D/g, '');
      if (digits.length >= 10) {
        this.form.controls.phoneE164.setValue(digits, { emitEvent: false });
        this.form.controls.whatsappNumber.setValue(digits, { emitEvent: false });
      }
    }));

    // Auto-generate booking ref prefix from clinic name (new clinics only)
    if (!this.isEdit) {
      this._subs.add(this.form.controls.name.valueChanges.subscribe(name => {
        if (!name) return;
        const prefix = name.trim().split(/\s+/)
          .map(w => w[0]?.toUpperCase() ?? '')
          .join('')
          .slice(0, 4);
        if (prefix) this.form.controls.bookingRefPrefix.setValue(prefix, { emitEvent: false });
      }));
    }

    // Billing auto-fills
    const updateAmount = () => {
      const plan  = this.form.controls.subscriptionPlan.value as 'trial' | 'starter' | 'pro';
      const cycle = this.form.controls.billingCycle.value as 'monthly' | 'yearly';
      const rate  = PLATFORM_PLANS[plan]
        ? (cycle === 'yearly' ? PLATFORM_PLANS[plan].yearly : PLATFORM_PLANS[plan].monthly)
        : 0;
      this.form.controls.lastPaymentAmount.setValue(rate, { emitEvent: false });
    };
    this._subs.add(this.form.controls.subscriptionPlan.valueChanges.subscribe(updateAmount));
    this._subs.add(this.form.controls.billingCycle.valueChanges.subscribe(updateAmount));

    // Auto-calculate subscriptionEndDate from lastPaymentDate + billingCycle
    const updateEndDate = () => {
      const paid  = this.form.controls.lastPaymentDate.value;
      const cycle = this.form.controls.billingCycle.value;
      if (!paid) return;
      const d = new Date(paid);
      if (cycle === 'yearly')  d.setFullYear(d.getFullYear() + 1);
      else                     d.setMonth(d.getMonth() + 1);
      this.form.controls.subscriptionEndDate.setValue(d.toISOString().split('T')[0], { emitEvent: false });
    };
    this._subs.add(this.form.controls.lastPaymentDate.valueChanges.subscribe(updateEndDate));
    this._subs.add(this.form.controls.billingCycle.valueChanges.subscribe(updateEndDate));
  }

  // TODO: Uncomment autoFillMapUrls + syncGoogleReviews when Google Maps API key is ready
  // /** Auto-fills map embed URL and directions URL from the Google Place ID */
  // autoFillMapUrls() {
  //   const placeId = this.form.controls.googlePlaceId.value?.trim();
  //   const apiKey  = environment.googleMapsApiKey;
  //   if (!placeId) { this.syncError.set('Enter a Google Place ID first.'); return; }
  //   const embedUrl = apiKey
  //     ? `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=place_id:${placeId}`
  //     : `https://maps.google.com/maps?q=place_id:${placeId}&output=embed`;
  //   const directionsUrl = `https://www.google.com/maps/search/?api=1&query=place_id:${placeId}`;
  //   this.form.controls.mapEmbedUrl.setValue(embedUrl);
  //   this.form.controls.mapDirectionsUrl.setValue(directionsUrl);
  //   this.syncError.set(null);
  // }

  // /** Fetches up to 5 Google reviews for the clinic and populates the testimonials array */
  // async syncGoogleReviews() {
  //   const placeId = this.form.controls.googlePlaceId.value?.trim();
  //   const apiKey  = environment.googleMapsApiKey;
  //   if (!placeId) { this.syncError.set('Enter a Google Place ID first.'); return; }
  //   if (!apiKey)  { this.syncError.set('Add googleMapsApiKey to environment.ts first.'); return; }
  //   this.syncing.set(true);
  //   this.syncError.set(null);
  //   try { await loadGoogleMapsScript(apiKey); } catch {
  //     this.syncing.set(false);
  //     this.syncError.set('Failed to load Google Maps API. Check your API key.');
  //     return;
  //   }
  //   const div = document.createElement('div');
  //   const service = new (window as any).google.maps.places.PlacesService(div);
  //   service.getDetails({ placeId, fields: ['reviews'] }, (result: any, status: string) => {
  //     this.ngZone.run(() => {
  //       this.syncing.set(false);
  //       if (status !== 'OK' || !result?.reviews?.length) {
  //         this.syncError.set(`No reviews found (status: ${status}). Verify the Place ID.`);
  //         return;
  //       }
  //       this.testimonialsArr.clear();
  //       (result.reviews as any[]).slice(0, 5).forEach((r: any) => {
  //         this.addTestimonial({ name: r.author_name || 'Patient', location: 'Google Review',
  //           rating: r.rating ?? 5, review: r.text || '' });
  //       });
  //     });
  //   });
  // }

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
      googlePlaceId: c.googlePlaceId ?? '',
      domain: c.domain ?? '', vercelDomain: c.vercelDomain ?? '', active: c.active ?? true,
      subscriptionPlan:    c.subscriptionPlan    ?? 'trial',
      subscriptionStatus:  c.subscriptionStatus  ?? 'trial',
      billingCycle:        c.billingCycle         ?? 'monthly',
      trialEndDate:        c.trialEndDate         ?? '',
      subscriptionEndDate: c.subscriptionEndDate  ?? '',
      lastPaymentDate:     c.lastPaymentDate      ?? '',
      lastPaymentAmount:   c.lastPaymentAmount    ?? 0,
      lastPaymentRef:      c.lastPaymentRef       ?? '',
      billingEmail:        c.billingEmail         ?? '',
      billingNotes:        c.billingNotes         ?? '',
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
        googlePlaceId:      v.googlePlaceId || undefined,
        subscriptionPlan:   v.subscriptionPlan   as 'trial' | 'starter' | 'pro',
        subscriptionStatus: v.subscriptionStatus as 'trial' | 'active' | 'expired' | 'cancelled',
        billingCycle:       v.billingCycle        as 'monthly' | 'yearly',
        trialEndDate:       v.trialEndDate        || undefined,
        subscriptionEndDate: v.subscriptionEndDate || undefined,
        lastPaymentDate:    v.lastPaymentDate     || undefined,
        lastPaymentAmount:  v.lastPaymentAmount   || undefined,
        lastPaymentRef:     v.lastPaymentRef      || undefined,
        billingEmail:       v.billingEmail        || undefined,
        billingNotes:       v.billingNotes        || undefined,
        domain:       v.domain,
        vercelDomain: v.vercelDomain,
        active:       v.active,
        theme: v.theme as 'blue' | 'teal' | 'caramel' | 'emerald' | 'purple' | 'rose',
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

  ngOnDestroy() {
    this._subs.unsubscribe();
  }
}
