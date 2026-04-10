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

// ── Component ─────────────────────────────────────────────────────────────────
@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './signup.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignupComponent implements OnInit {
  private readonly fb          = inject(FormBuilder);
  private readonly router      = inject(Router);
  private readonly destroyRef  = inject(DestroyRef);

  // ── Step state ───────────────────────────────────────────────────────────
  readonly step        = signal<1 | 2 | 3 | 4>(1);
  readonly submitting  = signal(false);
  readonly error       = signal<string | null>(null);
  readonly result      = signal<{
    siteUrl: string; adminUrl: string; email: string;
    plan: string; paymentUrl: string | null; trialEndDate: string | null;
  } | null>(null);

  // ── Slug availability ───────────────────────────────────────────────────
  readonly slugChecking   = signal(false);
  readonly slugAvailable  = signal<boolean | null>(null);

  // ── Plan state ──────────────────────────────────────────────────────────
  readonly selectedPlan = signal<'trial' | 'starter' | 'pro'>('trial');

  readonly plans = [
    {
      id: 'trial' as const,
      name: 'Free Trial',
      price: '₹0',
      period: '30 days',
      desc: 'Full website, no card needed',
      features: [
        'Fully responsive website',
        'Online appointment booking',
        'WhatsApp integration',
        'Patient admin dashboard',
        'Free subdomain',
        '30-day trial',
      ],
      highlighted: false,
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
        'Services catalogue page',
        'Priority WhatsApp support',
        '1 content update / month',
      ],
      highlighted: false,
    },
    {
      id: 'pro' as const,
      name: 'Pro',
      price: '₹699',
      period: '/month',
      desc: 'Most popular',
      features: [
        'Everything in Starter',
        'AI Voice Receptionist',
        'Google Reviews integration',
        'SEO optimised pages',
        'Unlimited content updates',
        'Priority support',
      ],
      highlighted: true,
    },
  ];

  // ── Forms ───────────────────────────────────────────────────────────────
  readonly step1 = this.fb.nonNullable.group({
    name:                ['', [Validators.required, Validators.minLength(3)]],
    doctorName:          ['', Validators.required],
    doctorQualification: ['BDS', Validators.required],
    city:                ['', Validators.required],
    phone:               ['', [Validators.required, Validators.pattern(/^[6-9]\d{9}$/)]],
    whatsappNumber:      [''],
  });

  readonly step2 = this.fb.nonNullable.group({
    slug:     ['', [Validators.required, Validators.pattern(/^[a-z0-9]{3,30}$/)]],
    email:    ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  readonly currentSlug = computed(() => this.step2.controls.slug.value);

  // ── Computed helpers ────────────────────────────────────────────────────
  readonly slugStatus = computed<'idle' | 'checking' | 'available' | 'taken'>(() => {
    if (this.slugChecking())               return 'checking';
    if (this.slugAvailable() === true)     return 'available';
    if (this.slugAvailable() === false)    return 'taken';
    return 'idle';
  });

  ngOnInit(): void {
    // Auto-fill slug from clinic name
    this.step1.controls.name.valueChanges.pipe(
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(name => {
      const slug = toSlug(name);
      this.step2.controls.slug.setValue(slug, { emitEvent: true });
    });

    // Auto-fill WhatsApp = phone if blank
    this.step1.controls.phone.valueChanges.pipe(
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(phone => {
      if (!this.step1.controls.whatsappNumber.value) {
        this.step1.controls.whatsappNumber.setValue(phone);
      }
    });

    // Real-time slug availability check
    this.step2.controls.slug.valueChanges.pipe(
      debounceTime(450),
      distinctUntilChanged(),
      switchMap(slug => {
        const clean = toSlug(slug ?? '');
        if (!clean || clean.length < 3) {
          this.slugAvailable.set(null);
          return of(null);
        }
        this.slugChecking.set(true);
        return isSlugAvailable(clean);
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(available => {
      this.slugChecking.set(false);
      if (available !== null) this.slugAvailable.set(available);
    });
  }

  // ── Navigation ──────────────────────────────────────────────────────────
  next(): void {
    if (this.step() === 1) {
      this.step1.markAllAsTouched();
      if (this.step1.invalid) return;
      this.step.set(2);
    } else if (this.step() === 2) {
      this.step2.markAllAsTouched();
      if (this.step2.invalid) return;
      if (this.slugStatus() === 'taken') return;
      this.step.set(3);
    } else if (this.step() === 3) {
      this.step.set(4);
    }
  }

  back(): void {
    const s = this.step();
    if (s > 1) this.step.set((s - 1) as 1 | 2 | 3 | 4);
  }

  selectPlan(plan: 'trial' | 'starter' | 'pro'): void {
    this.selectedPlan.set(plan);
  }

  cleanSlug(raw: string): string {
    return toSlug(raw);
  }

  onSlugInput(event: Event): void {
    const v = toSlug((event.target as HTMLInputElement).value);
    this.step2.controls.slug.setValue(v, { emitEvent: true });
  }

  isInvalid(ctrl: AbstractControl): boolean {
    return ctrl.invalid && ctrl.touched;
  }

  // ── Submit ──────────────────────────────────────────────────────────────
  async submit(): Promise<void> {
    if (this.submitting()) return;
    this.error.set(null);
    this.submitting.set(true);

    const s1 = this.step1.getRawValue();
    const s2 = this.step2.getRawValue();

    const phoneE164 = `91${s1.phone.replace(/\D/g, '')}`;

    try {
      const resp = await fetch('/api/self-signup', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:                s1.name.trim(),
          doctorName:          s1.doctorName.trim(),
          doctorQualification: s1.doctorQualification.trim(),
          city:                s1.city.trim(),
          phone:               s1.phone.trim(),
          phoneE164,
          whatsappNumber:      s1.whatsappNumber.trim() || phoneE164,
          email:               s2.email.trim(),
          password:            s2.password,
          slug:                s2.slug,
          plan:                this.selectedPlan(),
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
      this.step.set(4);
    } catch {
      this.error.set('Network error. Please check your connection and try again.');
    }

    this.submitting.set(false);
  }
}
