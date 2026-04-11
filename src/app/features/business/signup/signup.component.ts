import {
  Component, ChangeDetectionStrategy, signal, computed,
  inject, DestroyRef, OnInit,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators, AbstractControl } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, switchMap, of } from 'rxjs';
import {
  getFirestore, collection, query, where, limit, getDocs,
} from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';
import { environment } from '../../../../environments/environment';

// ── Firebase client (for slug availability check) ────────────────────────────
const app = getApps().length ? getApps()[0] : initializeApp(environment.firebase);
const db  = getFirestore(app);

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

// Resize image to max dimension and return base64 data URL
async function resizeImage(file: File, maxSize = 200): Promise<string> {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ratio   = Math.min(maxSize / img.width, maxSize / img.height, 1);
        canvas.width  = Math.round(img.width  * ratio);
        canvas.height = Math.round(img.height * ratio);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = e.target!.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// ── Theme definitions ─────────────────────────────────────────────────────────
export interface Theme {
  id: 'blue' | 'teal' | 'emerald' | 'purple' | 'rose' | 'caramel';
  name: string;
  hex: string;   // primary
  hexTo: string; // gradient end
}

export const THEMES: Theme[] = [
  { id: 'blue',    name: 'Ocean Blue',   hex: '#2563eb', hexTo: '#1e3a8a' },
  { id: 'teal',    name: 'Teal Green',   hex: '#0d9488', hexTo: '#134e4a' },
  { id: 'emerald', name: 'Emerald',      hex: '#059669', hexTo: '#064e3b' },
  { id: 'purple',  name: 'Royal Purple', hex: '#7c3aed', hexTo: '#4c1d95' },
  { id: 'rose',    name: 'Rose Red',     hex: '#e11d48', hexTo: '#881337' },
  { id: 'caramel', name: 'Caramel Gold', hex: '#b45309', hexTo: '#78350f' },
];

// ── Services ──────────────────────────────────────────────────────────────────
export const ALL_SERVICES = [
  'General Dentistry', 'Dental Cleaning', 'Tooth Filling',
  'Tooth Extraction', 'Root Canal Treatment', 'Dental Implants',
  'Teeth Whitening', 'Orthodontics / Braces', 'Cosmetic Dentistry',
  'Laser Dentistry', 'Pediatric Dentistry', 'Dental X-Ray',
  'Dentures', 'Crown & Bridge', 'Gum Treatment',
];

// ── Default hours ─────────────────────────────────────────────────────────────
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

  // ── Step ────────────────────────────────────────────────────────────────
  readonly step       = signal<1 | 2 | 3 | 4 | 5>(1);
  readonly submitting = signal(false);
  readonly error      = signal<string | null>(null);
  readonly result     = signal<{
    siteUrl: string; adminUrl: string; email: string;
    plan: string; paymentUrl: string | null; trialEndDate: string | null;
  } | null>(null);

  // ── Theme ────────────────────────────────────────────────────────────────
  readonly themes        = THEMES;
  readonly selectedTheme = signal<Theme>(THEMES[0]);

  selectTheme(t: Theme) { this.selectedTheme.set(t); }

  themeGradient(t: Theme = this.selectedTheme()) {
    return `linear-gradient(135deg, ${t.hex}, ${t.hexTo})`;
  }

  // ── Logo upload ──────────────────────────────────────────────────────────
  readonly logoDataUrl  = signal<string | null>(null);
  readonly logoUploading = signal(false);

  async onLogoUpload(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    this.logoUploading.set(true);
    const dataUrl = await resizeImage(file, 200);
    this.logoDataUrl.set(dataUrl);
    this.logoUploading.set(false);
  }

  removeLogo() { this.logoDataUrl.set(null); }

  // ── Services ─────────────────────────────────────────────────────────────
  readonly allServices     = ALL_SERVICES;
  readonly selectedServices = signal<Set<string>>(
    new Set(['General Dentistry', 'Dental Cleaning', 'Root Canal Treatment', 'Dental Implants'])
  );

  toggleService(s: string): void {
    const current = new Set(this.selectedServices());
    current.has(s) ? current.delete(s) : current.add(s);
    this.selectedServices.set(current);
  }

  isServiceSelected(s: string): boolean {
    return this.selectedServices().has(s);
  }

  // ── Hours ────────────────────────────────────────────────────────────────
  readonly clinicHours = signal<DayHour[]>(defaultHours());

  updateHour(index: number, field: keyof DayHour, value: string | boolean): void {
    const updated = this.clinicHours().map((h, i) =>
      i === index ? { ...h, [field]: value } : h
    );
    this.clinicHours.set(updated);
  }

  // ── Plan ─────────────────────────────────────────────────────────────────
  readonly selectedPlan = signal<'trial' | 'starter' | 'pro'>('trial');

  readonly plans = [
    {
      id: 'trial' as const,
      name: 'Free Trial',
      price: '₹0',
      period: '30 days',
      desc: 'Full website, no card needed',
      features: [
        'Responsive clinic website',
        'Online appointment booking',
        'WhatsApp notifications',
        'Patient admin dashboard',
        'Free subdomain included',
        '30-day free trial',
      ],
    },
    {
      id: 'starter' as const,
      name: 'Starter',
      price: '₹399',
      period: '/month',
      desc: 'For solo clinics',
      features: [
        'Everything in Trial',
        'Custom domain setup',
        'Free SSL certificate',
        'Services catalogue',
        'Priority WhatsApp support',
        '1 content update / month',
      ],
    },
    {
      id: 'pro' as const,
      name: 'Pro',
      price: '₹699',
      period: '/month',
      desc: 'Most popular',
      features: [
        'Everything in Starter',
        'AI Voice Receptionist 24/7',
        'Google Reviews integration',
        'SEO optimised pages',
        'Unlimited content updates',
        'Priority support',
      ],
    },
  ];

  // ── Slug availability ────────────────────────────────────────────────────
  readonly slugChecking  = signal(false);
  readonly slugAvailable = signal<boolean | null>(null);
  readonly showPassword  = signal(false);

  readonly slugStatus = computed<'idle' | 'checking' | 'available' | 'taken'>(() => {
    if (this.slugChecking())            return 'checking';
    if (this.slugAvailable() === true)  return 'available';
    if (this.slugAvailable() === false) return 'taken';
    return 'idle';
  });

  // ── Step 1 form ──────────────────────────────────────────────────────────
  readonly step1 = this.fb.nonNullable.group({
    name:                ['', [Validators.required, Validators.minLength(3)]],
    doctorName:          ['', Validators.required],
    doctorQualification: ['BDS', Validators.required],
    city:                ['', Validators.required],
    phone:               ['', [Validators.required, Validators.pattern(/^[6-9]\d{9}$/)]],
  });

  // ── Step 3 form (account) ────────────────────────────────────────────────
  readonly step3 = this.fb.nonNullable.group({
    slug:     ['', [Validators.required, Validators.pattern(/^[a-z0-9]{3,30}$/)]],
    email:    ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  // ── Live preview data ────────────────────────────────────────────────────
  readonly previewName    = computed(() => this.step1.controls.name.value    || 'Your Clinic Name');
  readonly previewDoctor  = computed(() => this.step1.controls.doctorName.value || 'Dr. Your Name');
  readonly previewDegree  = computed(() => this.step1.controls.doctorQualification.value || 'BDS');
  readonly previewCity    = computed(() => this.step1.controls.city.value    || 'Your City');
  readonly previewServices = computed(() => Array.from(this.selectedServices()).slice(0, 4));

  // ── Lifecycle ────────────────────────────────────────────────────────────
  ngOnInit(): void {
    // Auto-fill slug from clinic name
    this.step1.controls.name.valueChanges.pipe(
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(name => {
      this.step3.controls.slug.setValue(toSlug(name), { emitEvent: true });
    });

    // Real-time slug availability
    this.step3.controls.slug.valueChanges.pipe(
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
      this.step.set(2);
    } else if (s === 2) {
      this.step.set(3);
    } else if (s === 3) {
      this.step3.markAllAsTouched();
      if (this.step3.invalid) return;
      if (this.slugStatus() === 'taken') return;
      this.step.set(4);
    } else if (s === 4) {
      this.step.set(5);
    }
  }

  back(): void {
    const s = this.step();
    if (s > 1) this.step.set((s - 1) as 1 | 2 | 3 | 4 | 5);
  }

  selectPlan(plan: 'trial' | 'starter' | 'pro') { this.selectedPlan.set(plan); }

  onSlugInput(event: Event): void {
    const v = toSlug((event.target as HTMLInputElement).value);
    this.step3.controls.slug.setValue(v, { emitEvent: true });
  }

  isInvalid(ctrl: AbstractControl): boolean { return ctrl.invalid && ctrl.touched; }

  // ── Submit ───────────────────────────────────────────────────────────────
  async submit(): Promise<void> {
    if (this.submitting()) return;
    this.error.set(null);
    this.submitting.set(true);

    const s1 = this.step1.getRawValue();
    const s3 = this.step3.getRawValue();
    const phoneE164 = `91${s1.phone.replace(/\D/g, '')}`;

    // Format hours for Firestore
    const hours = this.clinicHours()
      .filter(h => !h.closed)
      .map(h => ({ days: h.day, time: `${h.open} – ${h.close}` }));

    // Format services
    const services = Array.from(this.selectedServices()).map(name => ({
      name,
      iconPath: '',
      description: '',
      benefit: '',
      price: 'On consultation',
    }));

    try {
      const resp = await fetch('/api/self-signup', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Clinic
          name:                s1.name.trim(),
          doctorName:          s1.doctorName.trim(),
          doctorQualification: s1.doctorQualification.trim(),
          city:                s1.city.trim(),
          phone:               s1.phone.trim(),
          phoneE164,
          whatsappNumber:      phoneE164,
          // Account
          email:               s3.email.trim(),
          password:            s3.password,
          slug:                s3.slug,
          // Plan
          plan:                this.selectedPlan(),
          // Customization
          theme:               this.selectedTheme().id,
          logoDataUrl:         this.logoDataUrl() ?? null,
          hours,
          services,
        }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        this.error.set(data.error ?? 'Something went wrong. Please try again.');
        this.submitting.set(false);
        return;
      }

      this.result.set({
        siteUrl:      data.siteUrl,
        adminUrl:     data.adminUrl,
        email:        data.email,
        plan:         data.plan,
        paymentUrl:   data.paymentUrl ?? null,
        trialEndDate: data.trialEndDate ?? null,
      });
      this.step.set(5);
    } catch {
      this.error.set('Network error. Please check your connection and try again.');
    }

    this.submitting.set(false);
  }

  // ── Step label helper ────────────────────────────────────────────────────
  stepLabel(s: number): string {
    return ['', 'Clinic', 'Customize', 'Account', 'Plan'][s] ?? '';
  }
}
