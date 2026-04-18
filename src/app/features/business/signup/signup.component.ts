import {
  Component, ChangeDetectionStrategy, signal, computed,
  inject, DestroyRef, OnInit, NgZone,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators, AbstractControl } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, switchMap, of } from 'rxjs';
import {
  getFirestore, collection, query, where, limit, getDocs,
} from 'firebase/firestore';
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signInWithPopup, GoogleAuthProvider, getIdToken, User,
} from 'firebase/auth';
import { initializeApp, getApps } from 'firebase/app';
import { environment } from '../../../../environments/environment';

// ── Firebase client ───────────────────────────────────────────────────────────
const app  = getApps().length ? getApps()[0] : initializeApp(environment.firebase);
const db   = getFirestore(app);
const auth = getAuth(app);

async function isSlugAvailable(slug: string): Promise<boolean> {
  if (!slug) return false;
  const snap = await getDocs(query(
    collection(db, 'clinics'),
    where('vercelDomain', '==', `${slug}.mydentalplatform.com`),
    limit(1),
  ));
  return snap.empty;
}

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30);
}

// ── Theme definitions ─────────────────────────────────────────────────────────
export interface Theme {
  id: 'blue' | 'teal' | 'emerald' | 'purple' | 'rose' | 'caramel';
  name: string;
  hex: string;
  hexTo: string;
}

export const THEMES: Theme[] = [
  { id: 'blue',    name: 'Ocean Blue',   hex: '#2563eb', hexTo: '#1e3a8a' },
  { id: 'teal',    name: 'Teal Green',   hex: '#0d9488', hexTo: '#134e4a' },
  { id: 'emerald', name: 'Emerald',      hex: '#059669', hexTo: '#064e3b' },
  { id: 'purple',  name: 'Royal Purple', hex: '#7c3aed', hexTo: '#4c1d95' },
  { id: 'rose',    name: 'Rose Red',     hex: '#e11d48', hexTo: '#881337' },
  { id: 'caramel', name: 'Caramel Gold', hex: '#b45309', hexTo: '#78350f' },
];

export const ALL_SERVICES = [
  'General Dentistry', 'Dental Cleaning', 'Tooth Filling',
  'Tooth Extraction', 'Root Canal Treatment', 'Dental Implants',
  'Teeth Whitening', 'Orthodontics / Braces', 'Cosmetic Dentistry',
  'Laser Dentistry', 'Pediatric Dentistry', 'Dental X-Ray',
  'Dentures', 'Crown & Bridge', 'Gum Treatment',
];

export interface DayHour { day: string; open: string; close: string; closed: boolean }

function defaultHours(): DayHour[] {
  return [
    { day: 'Monday',    open: '09:00', close: '18:00', closed: false },
    { day: 'Tuesday',   open: '09:00', close: '18:00', closed: false },
    { day: 'Wednesday', open: '09:00', close: '18:00', closed: false },
    { day: 'Thursday',  open: '09:00', close: '18:00', closed: false },
    { day: 'Friday',    open: '09:00', close: '18:00', closed: false },
    { day: 'Saturday',  open: '09:00', close: '14:00', closed: false },
    { day: 'Sunday',    open: '09:00', close: '13:00', closed: true  },
  ];
}

// ── Minimal Places type stubs (avoids @types/google.maps install) ─────────────
interface PlacePrediction {
  place_id:              string;
  description:           string;
  structured_formatting: { main_text: string; secondary_text: string };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const google: any;

// ── Component ─────────────────────────────────────────────────────────────────
@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './signup.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignupComponent implements OnInit {
  private readonly fb         = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly zone       = inject(NgZone);

  // ── Step: 0=auth, 1=clinic, 2=services, 4=plan, 5=success ───────────────
  readonly step       = signal<0 | 1 | 2 | 4 | 5>(0);
  readonly submitting = signal(false);
  readonly error      = signal<string | null>(null);
  readonly result     = signal<{
    siteUrl: string; adminUrl: string; email: string;
    plan: string; paymentUrl: string | null; trialEndDate: string | null;
  } | null>(null);

  // Visual step 1/2/3 for the progress stepper
  readonly visualStep = computed(() => {
    const s = this.step();
    if (s === 1) return 1;
    if (s === 2) return 2;
    if (s >= 4)  return 3;
    return 0;
  });

  // ── Auth ─────────────────────────────────────────────────────────────────
  readonly authMode      = signal<'signup' | 'signin'>('signup');
  readonly authLoading   = signal(false);
  readonly googleLoading = signal(false);
  readonly authError     = signal<string | null>(null);
  readonly showPassword  = signal(false);
  private  authUser      = signal<User | null>(null);
  readonly authEmail     = computed(() => this.authUser()?.email ?? '');

  readonly step0 = this.fb.nonNullable.group({
    email:    ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  async authenticateAndContinue(): Promise<void> {
    this.step0.markAllAsTouched();
    if (this.step0.invalid) return;
    this.authLoading.set(true);
    this.authError.set(null);
    const { email, password } = this.step0.getRawValue();
    try {
      let user: User;
      if (this.authMode() === 'signup') {
        user = (await createUserWithEmailAndPassword(auth, email, password)).user;
      } else {
        user = (await signInWithEmailAndPassword(auth, email, password)).user;
      }
      this.authUser.set(user);
      this.step.set(1);
    } catch (e: unknown) {
      const code = (e as { code?: string }).code ?? '';
      if (code === 'auth/email-already-in-use') {
        this.authError.set('Account already exists. Switch to Sign in below.');
        this.authMode.set('signin');
      } else if (['auth/user-not-found', 'auth/wrong-password', 'auth/invalid-credential'].includes(code)) {
        this.authError.set('Invalid email or password.');
      } else if (code === 'auth/weak-password') {
        this.authError.set('Password must be at least 6 characters.');
      } else {
        this.authError.set('Something went wrong. Please try again.');
      }
    } finally {
      this.authLoading.set(false);
    }
  }

  async loginWithGoogle(): Promise<void> {
    this.googleLoading.set(true);
    this.authError.set(null);
    try {
      const cred = await signInWithPopup(auth, new GoogleAuthProvider());
      this.authUser.set(cred.user);
      this.step.set(1);
    } catch (e: unknown) {
      const code = (e as { code?: string }).code ?? '';
      if (!code.includes('popup-closed') && !code.includes('cancelled')) {
        this.authError.set('Google sign-in failed. Please try again.');
      }
    } finally {
      this.googleLoading.set(false);
    }
  }

  // ── Theme ────────────────────────────────────────────────────────────────
  readonly themes        = THEMES;
  readonly selectedTheme = signal<Theme>(THEMES[0]);
  selectTheme(t: Theme) { this.selectedTheme.set(t); }
  themeGradient(t: Theme = this.selectedTheme()) {
    return `linear-gradient(135deg, ${t.hex}, ${t.hexTo})`;
  }

  // ── Google Places Autocomplete ───────────────────────────────────────────
  readonly placesReady      = signal(false);
  readonly suggestions      = signal<PlacePrediction[]>([]);
  readonly showDropdown     = signal(false);
  readonly manualMode       = signal(false);  // user chose "Enter manually"
  readonly loadingSuggestions = signal(false);
  private  placeCity        = '';
  private  autocompleteService: unknown = null;
  private  placesService:       unknown = null;

  private loadPlacesApi(): void {
    if (typeof window === 'undefined') { this.manualMode.set(true); return; }
    const key = environment.googleMapsApiKey;
    if (!key) { this.manualMode.set(true); return; }

    // Already loaded?
    if (typeof google !== 'undefined' && google?.maps?.places) {
      this.initPlaces(); return;
    }

    const cbName = '__gmpSignupCallback';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any)[cbName] = () => this.zone.run(() => this.initPlaces());

    const s = document.createElement('script');
    s.src   = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&callback=${cbName}`;
    s.async = true;
    s.onerror = () => this.zone.run(() => this.manualMode.set(true));
    document.head.appendChild(s);
  }

  private initPlaces(): void {
    const div = document.createElement('div');
    document.body.appendChild(div);
    this.autocompleteService = new google.maps.places.AutocompleteService();
    this.placesService       = new google.maps.places.PlacesService(div);
    this.placesReady.set(true);
  }

  onNameInput(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.step1.controls.name.setValue(val, { emitEvent: true });

    if (!val || val.length < 2 || this.manualMode() || !this.autocompleteService) {
      this.suggestions.set([]);
      this.showDropdown.set(false);
      return;
    }

    this.loadingSuggestions.set(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.autocompleteService as any).getPlacePredictions(
      { input: val, types: ['establishment'] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (predictions: PlacePrediction[] | null, status: any) => {
        this.zone.run(() => {
          this.loadingSuggestions.set(false);
          if (status === 'OK' && predictions?.length) {
            this.suggestions.set(predictions.slice(0, 5));
            this.showDropdown.set(true);
          } else {
            this.suggestions.set([]);
            this.showDropdown.set(false);
          }
        });
      }
    );
  }

  selectSuggestion(p: PlacePrediction): void {
    this.showDropdown.set(false);
    this.suggestions.set([]);
    const clinicName = p.structured_formatting.main_text;
    this.step1.controls.name.setValue(clinicName, { emitEvent: true });

    if (!this.placesService) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.placesService as any).getDetails(
      { placeId: p.place_id, fields: ['address_components', 'formatted_phone_number', 'international_phone_number'] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (place: any, status: any) => {
        this.zone.run(() => {
          if (status !== 'OK' || !place) return;
          // Auto-fill phone (prefer international format)
          const phone = (place.international_phone_number ?? place.formatted_phone_number ?? '').replace(/\s/g, '');
          if (phone) this.step1.controls.phone.setValue(phone);
          // Extract city
          const cityComp = (place.address_components as Array<{ long_name: string; types: string[] }> ?? [])
            .find(c => c.types.includes('locality') || c.types.includes('administrative_area_level_2'));
          this.placeCity = cityComp?.long_name ?? '';
        });
      }
    );
  }

  dismissDropdown(): void {
    // Small delay so click on suggestion registers before blur hides it
    setTimeout(() => this.zone.run(() => this.showDropdown.set(false)), 180);
  }

  enterManually(): void {
    this.manualMode.set(true);
    this.showDropdown.set(false);
    this.suggestions.set([]);
  }

  // ── Services ─────────────────────────────────────────────────────────────
  readonly allServices      = ALL_SERVICES;
  readonly selectedServices = signal<Set<string>>(
    new Set(['General Dentistry', 'Dental Cleaning', 'Root Canal Treatment', 'Dental Implants'])
  );
  toggleService(s: string): void {
    const cur = new Set(this.selectedServices());
    cur.has(s) ? cur.delete(s) : cur.add(s);
    this.selectedServices.set(cur);
  }
  isServiceSelected(s: string) { return this.selectedServices().has(s); }

  // ── Hours ────────────────────────────────────────────────────────────────
  readonly clinicHours = signal<DayHour[]>(defaultHours());
  updateHour(i: number, field: keyof DayHour, val: string | boolean): void {
    this.clinicHours.set(this.clinicHours().map((h, idx) => idx === i ? { ...h, [field]: val } : h));
  }

  // ── Plan ─────────────────────────────────────────────────────────────────
  readonly selectedPlan = signal<'trial' | 'starter' | 'pro'>('trial');

  readonly plans = [
    {
      id: 'trial' as const, name: 'Free Trial', price: '₹0', period: '30 days',
      desc: 'Full website · no card needed',
      features: ['Responsive clinic website', 'Online appointment booking', 'WhatsApp notifications',
                 'Patient admin dashboard', 'Free subdomain (yourname.mydentalplatform.com)', '30-day free trial'],
    },
    {
      id: 'starter' as const, name: 'Starter', price: '₹499', period: '/month',
      desc: 'For solo clinics',
      features: ['Everything in Trial', 'Custom domain (connect your own)', 'Auto SSL certificate',
                 'Services catalogue', '1 content update/month (text, image, or section)', 'Email + WhatsApp support'],
    },
    {
      id: 'pro' as const, name: 'Pro', price: '₹1,499', period: '/month',
      desc: 'Most popular',
      features: ['Everything in Starter', 'AI Voice Receptionist 24/7 (Hindi + English)',
                 '30 voice min/month · ₹20/min after', '3 content updates/month', '1 onboarding call (20 min)',
                 'Priority WhatsApp support', 'Revenue & analytics dashboard'],
    },
  ];

  // ── Slug availability ────────────────────────────────────────────────────
  readonly slugChecking  = signal(false);
  readonly slugAvailable = signal<boolean | null>(null);

  readonly slugStatus = computed<'idle' | 'checking' | 'available' | 'taken'>(() => {
    if (this.slugChecking())            return 'checking';
    if (this.slugAvailable() === true)  return 'available';
    if (this.slugAvailable() === false) return 'taken';
    return 'idle';
  });

  // ── Step 1 form — name, slug, phone ──────────────────────────────────────
  readonly step1 = this.fb.nonNullable.group({
    name:  ['', [Validators.required, Validators.minLength(3)]],
    slug:  ['', [Validators.required, Validators.pattern(/^[a-z0-9]{3,30}$/)]],
    phone: ['', [Validators.required, Validators.minLength(7)]],
  });

  readonly previewName     = computed(() => this.step1.controls.name.value  || 'Your Clinic Name');
  readonly previewServices = computed(() => Array.from(this.selectedServices()).slice(0, 4));

  // ── Lifecycle ────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.loadPlacesApi();

    // Auto-fill slug from clinic name
    this.step1.controls.name.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(name => {
        this.step1.controls.slug.setValue(toSlug(name), { emitEvent: true });
      });

    // Real-time slug availability check
    this.step1.controls.slug.valueChanges.pipe(
      debounceTime(450),
      distinctUntilChanged(),
      switchMap(slug => {
        const clean = toSlug(slug ?? '');
        if (!clean || clean.length < 3) { this.slugAvailable.set(null); return of(null); }
        this.slugChecking.set(true);
        return isSlugAvailable(clean);
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(available => {
      this.slugChecking.set(false);
      if (available !== null) this.slugAvailable.set(available);
    });
  }

  // ── Navigation ───────────────────────────────────────────────────────────
  next(): void {
    const s = this.step();
    if (s === 1) {
      this.step1.markAllAsTouched();
      if (this.step1.invalid) return;
      if (this.slugStatus() === 'taken' || this.slugStatus() === 'checking') return;
      this.step.set(2);
    } else if (s === 2) {
      this.step.set(4);
    }
  }

  back(): void {
    const s = this.step();
    if (s === 1) this.step.set(0);
    else if (s === 2) this.step.set(1);
    else if (s === 4) this.step.set(2);
  }

  selectPlan(plan: 'trial' | 'starter' | 'pro') { this.selectedPlan.set(plan); }

  onSlugInput(event: Event): void {
    const v = toSlug((event.target as HTMLInputElement).value);
    this.step1.controls.slug.setValue(v, { emitEvent: true });
  }

  isInvalid(ctrl: AbstractControl): boolean { return ctrl.invalid && ctrl.touched; }

  // ── Submit ───────────────────────────────────────────────────────────────
  async submit(): Promise<void> {
    if (this.submitting()) return;
    const user = this.authUser();
    if (!user) { this.error.set('Session expired. Please go back and sign in again.'); return; }

    this.error.set(null);
    this.submitting.set(true);

    const s1   = this.step1.getRawValue();
    const slug = s1.slug;

    const hours = this.clinicHours()
      .filter(h => !h.closed)
      .map(h => ({ days: h.day, time: `${h.open} – ${h.close}` }));

    const services = Array.from(this.selectedServices()).map(name => ({
      name, iconPath: '', description: '', benefit: '', price: 'On consultation',
    }));

    try {
      const idToken = await getIdToken(user, true);
      const resp = await fetch('/api/self-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          name:                s1.name.trim(),
          doctorName:          '',
          doctorQualification: '',
          city:                this.placeCity,
          phone:               s1.phone.trim(),
          phoneE164:           s1.phone.replace(/\D/g, ''),
          whatsappNumber:      s1.phone.replace(/\D/g, ''),
          slug,
          plan:  this.selectedPlan(),
          theme: this.selectedTheme().id,
          logoDataUrl: null,
          hours,
          services,
        }),
      });

      const data = await resp.json() as {
        siteUrl?: string; adminUrl?: string; email?: string;
        plan?: string; paymentUrl?: string | null; trialEndDate?: string | null;
        error?: string;
      };
      if (!resp.ok) {
        this.error.set(data.error ?? 'Something went wrong. Please try again.');
        this.submitting.set(false);
        return;
      }

      this.result.set({
        siteUrl:      data.siteUrl ?? '',
        adminUrl:     data.adminUrl     ?? '',
        email:        data.email        ?? '',
        plan:         data.plan         ?? 'trial',
        paymentUrl:   data.paymentUrl   ?? null,
        trialEndDate: data.trialEndDate ?? null,
      });
      this.step.set(5);
    } catch {
      this.error.set('Network error. Please check your connection and try again.');
    }
    this.submitting.set(false);
  }

  // ── Step label helper (visual steps 1–3) ─────────────────────────────────
  stepLabel(vs: number): string {
    return ['', 'Clinic', 'Services', 'Plan'][vs] ?? '';
  }

  // ── Step 5 — Congratulation page ─────────────────────────────────────────
  readonly copiedUrl = signal(false);

  /** 35 confetti pieces with deterministic pseudo-random positions/timing */
  readonly confettiPieces = Array.from({ length: 35 }, (_, i) => {
    const palette = ['#2563eb','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#14b8a6','#f97316','#a855f7'];
    const left    = ((i * 97  + 17) % 100);               // 0–99%
    const delay   = ((i * 37  + 11) % 30) / 10;           // 0–2.9s
    const dur     = (22 + ((i * 53  +  7) % 18)) / 10;    // 2.2–3.9s
    const size    = 6 + (i % 5) * 2;                      // 6–14 px
    return {
      id:    i,
      left:  left + '%',
      delay: delay + 's',
      dur:   dur.toFixed(1) + 's',
      color: palette[i % palette.length],
      size,
      cls:   i % 3 === 0 ? 'round' : (i % 5 === 0 ? 'strip' : ''),
    };
  });

  readonly nextTips = [
    { text: 'Visit your website and try booking an appointment as a patient' },
    { text: 'Log into your admin dashboard to manage and confirm bookings' },
    { text: 'Share your website link on WhatsApp with existing patients' },
    { text: 'Upgrade to Starter to connect your own custom domain' },
  ];

  copyUrl(url: string): void {
    navigator.clipboard.writeText(url).then(() => {
      this.copiedUrl.set(true);
      setTimeout(() => this.copiedUrl.set(false), 2500);
    }).catch(() => {/* clipboard not available */});
  }

  shareOnWhatsApp(): void {
    const url = this.result()?.siteUrl;
    if (!url) return;
    const msg = `My dental clinic website is now live! 🦷\n\nVisit us at: ${url}\n\nBook your appointment online in just 60 seconds!`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  }
}
