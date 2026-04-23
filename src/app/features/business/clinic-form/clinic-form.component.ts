import {
  Component, signal, ChangeDetectionStrategy, inject, OnInit, OnDestroy, NgZone,
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
import { SuperAuthService } from '../../../core/services/super-auth.service';

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

const CLINIC_THEME_OPTIONS = [
  {
    value: 'blue',
    label: 'Clinical Blue',
    note: 'Trusted and premium',
    gradient: 'linear-gradient(135deg,#1E56DC,#1235A9)',
  },
  {
    value: 'teal',
    label: 'Sterile Teal',
    note: 'Clean and modern',
    gradient: 'linear-gradient(135deg,#0B7285,#085E6F)',
  },
  {
    value: 'emerald',
    label: 'Fresh Mint',
    note: 'Friendly preventive care',
    gradient: 'linear-gradient(135deg,#059669,#065F46)',
  },
  {
    value: 'purple',
    label: 'Specialist Navy',
    note: 'Confident and advanced',
    gradient: 'linear-gradient(135deg,#0F4C81,#0B3657)',
  },
  {
    value: 'rose',
    label: 'Aqua Mist',
    note: 'Soft family comfort',
    gradient: 'linear-gradient(135deg,#0891B2,#0E7490)',
  },
  {
    value: 'caramel',
    label: 'Porcelain Slate',
    note: 'Calm boutique finish',
    gradient: 'linear-gradient(135deg,#4D7C8A,#325764)',
  },
] as const;

function toSubdomainSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30);
}

function normalizeHostedDomain(value: string): string {
  const clean = value.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');

  if (!clean) return '';
  if (clean.endsWith('.mydentalplatform.com')) return clean;

  const slug = toSubdomainSlug(clean);
  return slug ? `${slug}.mydentalplatform.com` : '';
}

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
  private superAuth   = inject(SuperAuthService);
  private route       = inject(ActivatedRoute);
  private router      = inject(Router);
  // private ngZone   = inject(NgZone); // TODO: Uncomment with Google Maps API

  readonly platformPlans = PLATFORM_PLANS;
  readonly themeOptions  = CLINIC_THEME_OPTIONS;

  private zone = inject(NgZone);

  loading        = signal(false);
  saving         = signal(false);
  error          = signal<string | null>(null);
  success        = signal(false);
  activeSection  = signal<string>('identity');
  ownedClinic    = signal<StoredClinic | null>(null);

  readonly SECTIONS = ['identity', 'contact', 'hours', 'brand', 'services', 'plans', 'testimonials', 'billing'];

  private intersectionObserver: IntersectionObserver | null = null;
  private previewDomainManuallyEdited = false;
  // syncing   = signal(false);   // TODO: Uncomment with Google Maps API
  // syncError = signal<string | null>(null);

  isEdit   = false;
  clinicId: string | null = null;

  // ── Form ──────────────────────────────────────────────────────────────────
  form = this.fb.nonNullable.group({
    // Identity
    name:                ['', Validators.required],
    doctorName:          ['', Validators.required],
    doctorQualification: [''],
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
      this.addHour();

      // Default trial: starts today, ends in 30 days
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 30);
      this.form.controls.trialEndDate.setValue(trialEnd.toISOString().split('T')[0]);
      this.form.controls.subscriptionPlan.setValue('trial');
      this.form.controls.subscriptionStatus.setValue('trial');

      await this.superAuth.authReady;
      const uid = this.superAuth.currentUser()?.uid;
      if (uid) {
        this.ownedClinic.set(await this.clinicStore.getByAdminUid(uid));
      }
    }

    this.setupAutoFills();
    setTimeout(() => this.setupSectionObserver(), 300);
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

        const slug = toSubdomainSlug(name);
        if (slug && !this.previewDomainManuallyEdited) {
          this.form.controls.vercelDomain.setValue(`${slug}.mydentalplatform.com`, { emitEvent: false });
        }
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
      doctorQualification: c.doctorQualification ?? '',
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
    if (this.form.invalid) {
      this.error.set('Fix the highlighted required fields before saving.');
      return;
    }

    this.saving.set(true);
    this.error.set(null);

    try {
      const v = this.form.getRawValue();
      const hostedDomain = await this.resolveHostedDomain(v.name, v.vercelDomain);

      // Firestore rejects `undefined` — use null for optional fields so
      // existing values are cleared when the admin empties them.
      const payload = {
        name:                v.name,
        doctorName:          v.doctorName,
        doctorQualification: v.doctorQualification || null,
        patientCount:        v.patientCount        || null,
        phone:               v.phone,
        phoneE164:           v.phoneE164           || null,
        whatsappNumber:      v.whatsappNumber      || null,
        addressLine1:        v.addressLine1,
        addressLine2:        v.addressLine2        || null,
        city:                v.city,
        mapEmbedUrl:         v.mapEmbedUrl         || null,
        mapDirectionsUrl:    v.mapDirectionsUrl    || null,
        googlePlaceId:       v.googlePlaceId       || null,
        subscriptionPlan:    v.subscriptionPlan    as 'trial' | 'starter' | 'pro',
        subscriptionStatus:  v.subscriptionStatus  as 'trial' | 'active' | 'expired' | 'cancelled',
        billingCycle:        v.billingCycle         as 'monthly' | 'yearly',
        trialEndDate:        v.trialEndDate         || null,
        subscriptionEndDate: v.subscriptionEndDate  || null,
        lastPaymentDate:     v.lastPaymentDate      || null,
        lastPaymentAmount:   v.lastPaymentAmount    ?? null,   // ?? keeps 0 as valid
        lastPaymentRef:      v.lastPaymentRef       || null,
        billingEmail:        v.billingEmail         || null,
        billingNotes:        v.billingNotes         || null,
        domain:              v.domain               || null,
        vercelDomain:        hostedDomain           || null,
        active:              v.active,
        theme:               v.theme as 'blue' | 'teal' | 'caramel' | 'emerald' | 'purple' | 'rose',
        bookingRefPrefix:    v.bookingRefPrefix,
        social: {
          facebook:  v.facebook  || null,
          instagram: v.instagram || null,
          linkedin:  v.linkedin  || null,
        },
        doctorBio: (v.doctorBio as string[])
          .map(paragraph => paragraph.trim())
          .filter(Boolean),
        hours: (v.hours as Array<{ days: string; time: string }>)
          .filter(slot => slot.days.trim() || slot.time.trim()),
        services:     v.services as StoredClinic['services'],
        plans:        (v.plans as Array<Record<string, unknown>>).map(p => ({
          ...p,
          features: p['features'] as string[],
        })) as StoredClinic['plans'],
        testimonials: v.testimonials as StoredClinic['testimonials'],
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const firestorePayload = payload as any;
      if (this.isEdit) {
        await this.clinicStore.update(this.clinicId!, firestorePayload);
        await this.registerHostedDomain(hostedDomain);
      } else {
        await this.superAuth.authReady;
        const user = this.superAuth.currentUser();
        if (!user) {
          throw new Error('You must be signed in to create a clinic.');
        }

        const existingClinic = this.ownedClinic() ?? await this.clinicStore.getByAdminUid(user.uid);
        if (existingClinic) {
          this.ownedClinic.set(existingClinic);
          throw new Error('This account already has a clinic. Open the existing clinic instead of creating another one.');
        }

        firestorePayload.adminUid = user.uid;
        firestorePayload.adminEmail = user.email?.trim() || null;
        firestorePayload.rating = '4.9';
        await this.clinicStore.create(firestorePayload);
        await this.registerHostedDomain(hostedDomain);
      }

      this.success.set(true);
      setTimeout(() => this.router.navigate(['/business/clinics']), 1200);
    } catch (err) {
      console.error('[ClinicForm] save failed:', err);
      const msg = err instanceof Error ? err.message : String(err);
      this.error.set(`Failed to save: ${msg.slice(0, 120)}`);
    } finally {
      this.saving.set(false);
    }
  }

  /** Scrolls to a section by id — avoids Angular router intercepting hash links */
  scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  markPreviewDomainManual() {
    this.previewDomainManuallyEdited = true;
  }

  normalizePreviewDomain() {
    const normalized = normalizeHostedDomain(this.form.controls.vercelDomain.value);
    if (normalized) {
      this.form.controls.vercelDomain.setValue(normalized, { emitEvent: false });
    }
  }

  private async generateAvailableSubdomain(name: string): Promise<string> {
    const baseSlug = toSubdomainSlug(name);
    if (!baseSlug) return '';

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const suffix = attempt === 0 ? '' : String(attempt + 1);
      const candidate = `${baseSlug}${suffix}.mydentalplatform.com`;
      const existing = await this.clinicStore.getByVercelDomain(candidate);
      if (!existing || existing.id === this.clinicId) return candidate;
    }

    return `${baseSlug}${Date.now().toString(36).slice(-4)}.mydentalplatform.com`;
  }

  private async resolveHostedDomain(name: string, value: string): Promise<string> {
    const normalized = normalizeHostedDomain(value);
    if (!normalized) return this.generateAvailableSubdomain(name);

    const existing = await this.clinicStore.getByVercelDomain(normalized);
    if (!existing || existing.id === this.clinicId) return normalized;

    if (this.isEdit) {
      throw new Error('This preview website address is already used by another clinic.');
    }

    const slug = normalized.replace(/\.mydentalplatform\.com$/, '');
    return this.generateAvailableSubdomain(slug);
  }

  private async registerHostedDomain(domain: string): Promise<void> {
    if (!domain.endsWith('.mydentalplatform.com')) return;

    await this.superAuth.authReady;
    const user = this.superAuth.currentUser();
    if (!user) throw new Error('You must be signed in to register the clinic subdomain.');

    const response = await fetch('/api/domain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain,
        idToken: await user.getIdToken(),
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(`Clinic saved, but ${domain} was not registered on Vercel: ${data.error ?? 'Unknown error'}`);
    }
  }

  /** Uses IntersectionObserver to track which section is currently in view */
  private setupSectionObserver() {
    this.intersectionObserver?.disconnect();
    this.intersectionObserver = new IntersectionObserver(
      entries => {
        const visible = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length) {
          this.zone.run(() => this.activeSection.set(visible[0].target.id));
        }
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: 0 },
    );
    this.SECTIONS.forEach(id => {
      const el = document.getElementById(id);
      if (el) this.intersectionObserver!.observe(el);
    });
  }

  /** Quick-fill: populate standard dental services in one click */
  fillDentalServices() {
    this.servicesArr.clear();
    [
      { name: 'Dental Check-up & Cleaning', description: 'Comprehensive oral exam, scaling, polishing', benefit: 'Pain-free in 30 mins', price: '₹500 – ₹1,000' },
      { name: 'Tooth Filling', description: 'Composite resin fillings — tooth-colored, durable', benefit: 'Looks completely natural', price: '₹800 – ₹2,000' },
      { name: 'Root Canal Treatment', description: 'Single-sitting RCT with advanced rotary files', benefit: 'Save your natural tooth', price: '₹3,000 – ₹8,000' },
      { name: 'Tooth Extraction', description: 'Simple and surgical extractions with local anaesthesia', benefit: 'Minimal pain, quick healing', price: '₹500 – ₹3,000' },
      { name: 'Teeth Whitening', description: 'Professional laser whitening — 4–8 shades brighter', benefit: 'Instant visible results', price: '₹4,000 – ₹8,000' },
      { name: 'Dental Implants', description: 'Titanium implants — permanent, looks & feels like real teeth', benefit: 'Lifetime solution', price: '₹25,000 – ₹50,000' },
    ].forEach(s => this.addService(s));
  }

  /** Quick-fill: standard clinic hours */
  fillStandardHours() {
    this.hoursArr.clear();
    [
      { days: 'Monday – Saturday', time: '9:00 AM – 8:00 PM' },
      { days: 'Sunday', time: '10:00 AM – 2:00 PM' },
    ].forEach(h => this.addHour(h.days, h.time));
  }

  ngOnDestroy() {
    this.intersectionObserver?.disconnect();
    this._subs.unsubscribe();
  }

  get accountAlreadyLinked(): boolean {
    return !this.isEdit && !!this.ownedClinic();
  }
}
