import {
  Component, signal, ChangeDetectionStrategy,
  inject, OnInit, OnDestroy, DestroyRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ReactiveFormsModule, FormBuilder, FormArray, FormGroup, Validators,
} from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { ClinicConfigService } from '../../../core/services/clinic-config.service';
import { ClinicFirestoreService } from '../../../core/services/clinic-firestore.service';
import {
  Testimonial,
  ClinicHours,
  ClinicConfig,
  ClinicService,
  formatPlatformPlanPrice,
} from '../../../core/config/clinic.config';
import { BillingService, BillingPlan, BillingCycle } from '../../../core/services/billing.service';

type TabId =
  | 'info'
  | 'contact'
  | 'hours'
  | 'services'
  | 'testimonials'
  | 'social'
  | 'theme'
  | 'logo'
  | 'subscription'
  | 'voice';

export interface ThemeOption {
  value: ClinicConfig['theme'];
  label: string;
  note: string;
  primary: string;
  dark: string;
  light: string;
  gradient: string;
}

interface WhatsappAccountOption {
  phoneNumberId: string;
  phoneNumber: string;
  phoneNumberName: string;
  businessAccountName: string;
  assignedAgentId: string | null;
  assignedAgentName: string | null;
  enableMessaging: boolean;
  enableAudioMessageResponse: boolean;
  isTokenExpired: boolean;
  connectedToCurrentAgent: boolean;
}

const GENERIC_SERVICE_ICON =
  'M12 2.5c-2.4 0-4.2 1.5-5.1 3.4-.5.9-.7 2-.7 3 0 1.8.8 3.1.8 4.9 0 1.3.8 4.5 2 6 .4.5.9.1 1.1-.6.3-1.8.4-3.2 1.9-3.2s1.6 1.4 1.9 3.2c.2.7.7 1.1 1.1.6 1.2-1.5 2-4.7 2-6 0-1.8.8-3.1.8-4.9 0-1-.2-2.1-.7-3C16.2 4 14.4 2.5 12 2.5z';

const DEFAULT_SERVICE_LIBRARY: ClinicService[] = [
  {
    iconPath: GENERIC_SERVICE_ICON,
    name: 'Dental Check-up & Cleaning',
    description: 'Routine exam, cleaning, polishing, and preventive guidance.',
    benefit: 'Best for regular visits',
    price: 'On consultation',
  },
  {
    iconPath: GENERIC_SERVICE_ICON,
    name: 'Tooth Filling',
    description: 'Tooth-coloured fillings for cavities and minor damage.',
    benefit: 'Natural-looking restoration',
    price: 'On consultation',
  },
  {
    iconPath: GENERIC_SERVICE_ICON,
    name: 'Root Canal Treatment',
    description: 'Modern rotary treatment for infected or painful teeth.',
    benefit: 'Save your natural tooth',
    price: 'On consultation',
  },
  {
    iconPath: GENERIC_SERVICE_ICON,
    name: 'Tooth Extraction',
    description: 'Simple and surgical extraction with gentle pain control.',
    benefit: 'Quick relief and recovery',
    price: 'On consultation',
  },
  {
    iconPath: GENERIC_SERVICE_ICON,
    name: 'Teeth Whitening',
    description: 'Professional smile-brightening for stains and dull enamel.',
    benefit: 'Visible cosmetic boost',
    price: 'On consultation',
  },
  {
    iconPath: GENERIC_SERVICE_ICON,
    name: 'Dental Implants',
    description: 'Long-term replacement for missing teeth with stable function.',
    benefit: 'Fixed replacement option',
    price: 'On consultation',
  },
];

@Component({
  selector: 'app-admin-settings',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './admin-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSettingsComponent implements OnInit, OnDestroy {
  private clinicCfg  = inject(ClinicConfigService);
  private store      = inject(ClinicFirestoreService);
  private billing    = inject(BillingService);
  private fb         = inject(FormBuilder);
  private route      = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);

  loading            = signal(true);
  upgrading          = signal(false);
  upgradeError       = signal<string | null>(null);
  selectedBillingCycle = signal<BillingCycle>('monthly');
  activeTab          = signal<TabId>('info');
  savingInfo         = signal(false);
  savingContact      = signal(false);
  savingHours        = signal(false);
  savingServices     = signal(false);
  savingTestimonials = signal(false);
  savingSocial       = signal(false);
  savingTheme        = signal(false);
  savingVoice        = signal(false);
  creatingVoiceAgent = signal(false);
  savingLogo         = signal(false);
  dirtyTabs          = signal<Set<TabId>>(new Set());
  selectedTheme      = signal<ClinicConfig['theme']>('blue');
  logoPreview        = signal<string | null>(null);
  logoError          = signal<string | null>(null);
  voiceUsage         = signal<{ conversations: number; minutesUsed: number; minutesLimit: number } | null>(null);
  loadingUsage       = signal(false);
  whatsappAccounts   = signal<WhatsappAccountOption[]>([]);
  loadingWhatsappAccounts = signal(false);
  whatsappAccountsError = signal<string | null>(null);
  toast              = signal<{ msg: string; type: 'success' | 'error' } | null>(null);

  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private persistedTheme = signal<ClinicConfig['theme']>('blue');

  readonly tabs: Array<{ id: TabId; label: string }> = [
    { id: 'info',         label: 'Profile' },
    { id: 'contact',      label: 'Contact' },
    { id: 'hours',        label: 'Hours' },
    { id: 'services',     label: 'Services' },
    { id: 'testimonials', label: 'Testimonials' },
    { id: 'social',       label: 'Social' },
    { id: 'theme',        label: 'Theme' },
    { id: 'logo',         label: 'Logo' },
    { id: 'subscription', label: 'Plan' },
    { id: 'voice',        label: 'Voice Agent' },
  ];

  readonly PLANS = [
    {
      id: 'trial', label: 'Free Trial', price: '₹0', period: '30 days',
      features: ['Clinic website', 'Online booking', 'WhatsApp integration', 'Patient admin dashboard', 'Free subdomain'],
      locked: ['Custom logo upload', 'Theme controls', 'Remove mydentalplatform branding', 'Custom domain'],
    },
    {
      id: 'starter', label: 'Starter', price: '₹999', period: '/month',
      features: ['Everything in Trial', 'Custom logo & theme controls', 'Remove mydentalplatform branding', 'Custom domain setup', 'Free SSL certificate', 'Email + WhatsApp support'],
      locked: ['AI Voice Receptionist', 'WhatsApp AI auto replies', 'Voice minutes'],
    },
    {
      id: 'pro', label: 'Pro', price: '₹2,499', period: '/month',
      features: ['Everything in Starter', 'AI Voice Receptionist 24/7', 'Hindi + English + Hinglish', '30 voice min/month included', '₹20/min after 30 min', '3 content updates/month', '1 onboarding call (20 min)', 'Revenue & analytics dashboard', 'Priority support'],
      locked: [],
    },
  ] as const;

  readonly themeOptions: ThemeOption[] = [
    { value: 'blue',    label: 'Clinical Blue',   note: 'Trusted and premium',      primary: '#1E56DC', dark: '#1235A9', light: '#EBF2FF', gradient: 'linear-gradient(135deg,#1E56DC,#1235A9)' },
    { value: 'teal',    label: 'Sterile Teal',    note: 'Clean and modern',         primary: '#0B7285', dark: '#085E6F', light: '#ECFEFF', gradient: 'linear-gradient(135deg,#0B7285,#085E6F)' },
    { value: 'emerald', label: 'Fresh Mint',      note: 'Friendly preventive care', primary: '#059669', dark: '#065F46', light: '#ECFDF5', gradient: 'linear-gradient(135deg,#059669,#065F46)' },
    { value: 'purple',  label: 'Specialist Navy', note: 'Confident and advanced',   primary: '#0F4C81', dark: '#0B3657', light: '#EEF6FB', gradient: 'linear-gradient(135deg,#0F4C81,#0B3657)' },
    { value: 'rose',    label: 'Aqua Mist',       note: 'Soft family comfort',      primary: '#0891B2', dark: '#0E7490', light: '#ECFEFF', gradient: 'linear-gradient(135deg,#0891B2,#0E7490)' },
    { value: 'caramel', label: 'Porcelain Slate', note: 'Calm boutique finish',     primary: '#4D7C8A', dark: '#325764', light: '#F4F9FB', gradient: 'linear-gradient(135deg,#4D7C8A,#325764)' },
  ];

  readonly VOICE_OPTIONS = [
    { id: '9BWtsMINqrJLrRacOk9x', name: 'Aria',      gender: 'Female',  style: 'Warm & professional' },
    { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah',     gender: 'Female',  style: 'Soft & reassuring' },
    { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura',     gender: 'Female',  style: 'Upbeat & friendly' },
    { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', gender: 'Female',  style: 'Confident & clear' },
    { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger',     gender: 'Male',    style: 'Deep & trustworthy' },
    { id: 'SAz9YHcvj6GT2YYXdXww', name: 'River',     gender: 'Neutral', style: 'Calm & balanced' },
  ] as const;

  readonly STARS = [1, 2, 3, 4, 5] as const;
  readonly Math = Math;

  infoForm = this.fb.nonNullable.group({
    name:                ['', Validators.required],
    doctorName:          ['', Validators.required],
    doctorQualification: [''],
    patientCount:        [''],
    doctorBio:           [''],
  });

  contactForm = this.fb.nonNullable.group({
    phone:            ['', [Validators.required, Validators.pattern(/^[\d\s+\-()\u0966-\u096F]{7,15}$/)]],
    addressLine1:     ['', Validators.required],
    addressLine2:     [''],
    city:             ['', Validators.required],
    mapEmbedUrl:      [''],
    mapDirectionsUrl: [''],
  });

  hoursForm = this.fb.nonNullable.group({
    hours: this.fb.nonNullable.array<FormGroup>([]),
  });

  servicesForm = this.fb.nonNullable.group({
    services: this.fb.nonNullable.array<FormGroup>([]),
  });

  testimonialsForm = this.fb.nonNullable.group({
    testimonials: this.fb.nonNullable.array<FormGroup>([]),
  });

  socialForm = this.fb.nonNullable.group({
    facebook:  [''],
    instagram: [''],
    linkedin:  [''],
  });

  voiceForm = this.fb.nonNullable.group({
    greeting:  [''],
    language:  ['bilingual' as 'hindi' | 'english' | 'bilingual'],
    persona:   [''],
    voiceId:   ['9BWtsMINqrJLrRacOk9x'],
    whatsapp:  [''],
  });

  get cfg() { return this.clinicCfg.config; }
  get plan() { return this.cfg.subscriptionPlan ?? 'trial'; }
  get planStatus() { return this.cfg.subscriptionStatus ?? 'trial'; }
  get hoursArr() { return this.hoursForm.controls.hours as FormArray; }
  get servicesArr() { return this.servicesForm.controls.services as FormArray; }
  get testimonialsArr() { return this.testimonialsForm.controls.testimonials as FormArray; }
  get clinicInitial(): string {
    return (this.infoForm.get('name')?.value || this.cfg.name || 'C').trim().charAt(0).toUpperCase() || 'C';
  }
  get websiteHost(): string {
    return this.cfg.domain || this.cfg.vercelDomain || 'yourclinic.mydentalplatform.com';
  }
  get selectedThemeMeta(): ThemeOption {
    return this.themeOptions.find(opt => opt.value === this.selectedTheme()) ?? this.themeOptions[0];
  }
  get selectedWhatsappAccount(): WhatsappAccountOption | null {
    const selectedId = this.voiceForm.controls.whatsapp.value;
    return this.whatsappAccounts().find(account => account.phoneNumberId === selectedId) ?? null;
  }
  get trialDaysLeft(): number {
    if (!this.cfg.trialEndDate) return 30;
    const end = new Date(this.cfg.trialEndDate).getTime();
    return Math.max(0, Math.ceil((end - Date.now()) / 86_400_000));
  }
  get isExpired() {
    return this.planStatus === 'expired' || (this.planStatus === 'trial' && this.trialDaysLeft <= 0);
  }
  get isPending() { return this.planStatus === 'pending'; }
  get isTrial() { return this.planStatus === 'trial' && this.trialDaysLeft > 0; }
  get isStarter() { return this.plan === 'starter' && this.planStatus === 'active'; }
  get isPro() { return this.plan === 'pro' && this.planStatus === 'active'; }
  get canManageBranding() { return this.isStarter || this.isPro; }
  get canManageVoice() { return this.isPro; }

  get setupChecklist(): Array<{ label: string; done: boolean; tab: TabId; hint: string }> {
    const c = this.cfg;
    return [
      { label: 'Clinic name and doctor profile', done: !!(c.name && c.doctorName && c.doctorQualification), tab: 'info',         hint: 'This drives branding across the website and booking flow' },
      { label: 'Phone number & address',         done: !!(c.phone && c.addressLine1),                         tab: 'contact',      hint: 'Required for patients to reach you quickly' },
      { label: 'Map link added',                 done: !!(c.mapEmbedUrl || c.mapDirectionsUrl),               tab: 'contact',      hint: 'Helps patients find your clinic easily' },
      { label: 'Clinic hours set',               done: c.hours.length > 0,                                    tab: 'hours',        hint: 'Shows when the clinic is open on the website' },
      { label: 'Services listed',                done: c.services.length > 0,                                 tab: 'services',     hint: 'Used on the homepage, services page, and booking form' },
      { label: 'At least one testimonial',       done: c.testimonials.length > 0,                             tab: 'testimonials', hint: 'Social proof improves booking conversions' },
      { label: 'Logo uploaded',                  done: !!c.logoDataUrl,                                       tab: 'logo',         hint: 'Builds patient trust and improves brand recall' },
      { label: 'Voice agent configured',         done: !!c.elevenLabsAgentId,                                 tab: 'voice',        hint: 'Capture missed calls 24/7 automatically' },
    ];
  }

  get setupDoneCount(): number { return this.setupChecklist.filter(item => item.done).length; }
  get setupScore(): number {
    return Math.round((this.setupDoneCount / this.setupChecklist.length) * 100);
  }

  planPrice(plan: BillingPlan): string {
    return formatPlatformPlanPrice(plan, this.selectedBillingCycle());
  }

  currentPlanLabel(): string {
    const cycle = this.cfg.billingCycle ?? 'monthly';

    if (this.isExpired) return 'Trial expired';
    if (this.isPending) {
      const pendingPlan = this.plan === 'pro' ? 'Pro' : 'Starter';
      return `${pendingPlan} pending payment`;
    }
    if (this.isTrial) return `Free Trial - ${this.trialDaysLeft} days left`;
    if (this.isStarter) return `Starter - ${formatPlatformPlanPrice('starter', cycle)}`;
    if (this.isPro) return `Pro - ${formatPlatformPlanPrice('pro', cycle)}`;
    return 'Trial';
  }

  upgradeTargetPlan(): BillingPlan {
    if (this.plan === 'pro' && this.isPending) return 'pro';
    if (this.isStarter) return 'pro';
    return 'starter';
  }

  upgradeButtonLabel(plan: BillingPlan): string {
    const prefix = this.isPending && this.plan === plan ? 'Complete' : 'Upgrade to';
    return `${prefix} ${plan === 'pro' ? 'Pro' : 'Starter'} - ${this.planPrice(plan)}`;
  }

  markDirty(tab: TabId) { this.dirtyTabs.update(set => new Set([...set, tab])); }
  clearDirty(tab: TabId) {
    this.dirtyTabs.update(set => {
      const next = new Set(set);
      next.delete(tab);
      return next;
    });
  }
  isTabDirty(tab: TabId) { return this.dirtyTabs().has(tab); }

  ngOnInit() {
    const tab = this.route.snapshot.queryParamMap.get('tab') as TabId | null;
    if (tab && this.tabs.some(item => item.id === tab)) {
      this.activeTab.set(tab);
    }

    const cfg = this.clinicCfg.config;
    this.infoForm.patchValue({
      name:                cfg.name ?? '',
      doctorName:          cfg.doctorName ?? '',
      doctorQualification: cfg.doctorQualification ?? '',
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

    this.selectedTheme.set(cfg.theme ?? 'blue');
    this.persistedTheme.set(cfg.theme ?? 'blue');

    (cfg.hours ?? []).forEach(hour => this.addHour(hour.days, hour.time));
    (cfg.services ?? []).forEach(service => this.addService(service));
    (cfg.testimonials ?? []).forEach(item => this.addTestimonial(item));

    this.socialForm.patchValue({
      facebook:  cfg.social?.facebook ?? '',
      instagram: cfg.social?.instagram ?? '',
      linkedin:  cfg.social?.linkedin ?? '',
    });

    this.voiceForm.patchValue({
      greeting: cfg.voiceAgentGreeting ?? '',
      language: cfg.voiceAgentLanguage ?? 'bilingual',
      persona:  cfg.voiceAgentPersona ?? '',
      voiceId:  cfg.voiceAgentVoiceId ?? '9BWtsMINqrJLrRacOk9x',
      whatsapp: cfg.voiceAgentWhatsapp ?? '',
    });

    if (cfg.elevenLabsAgentId && cfg.clinicId && cfg.clinicId !== 'default') {
      this.fetchUsage();
      void this.fetchWhatsappAccounts();
    }

    this.loading.set(false);

    this.infoForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.markDirty('info'));
    this.contactForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.markDirty('contact'));
    this.hoursForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.markDirty('hours'));
    this.servicesForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.markDirty('services'));
    this.testimonialsForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.markDirty('testimonials'));
    this.socialForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.markDirty('social'));
    this.voiceForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.markDirty('voice'));
  }

  ngOnDestroy() {
    if (this.selectedTheme() !== this.persistedTheme()) {
      this.clinicCfg.updateConfig({ theme: this.persistedTheme() });
    }
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }

  addHour(days = '', time = '') {
    this.hoursArr.push(this.fb.nonNullable.group({
      days: [days],
      time: [time],
    }));
  }

  removeHour(index: number) {
    this.hoursArr.removeAt(index);
  }

  addService(service?: Partial<ClinicService>) {
    this.servicesArr.push(this.fb.nonNullable.group({
      name:        [service?.name ?? '', Validators.required],
      description: [service?.description ?? ''],
      benefit:     [service?.benefit ?? ''],
      price:       [service?.price ?? ''],
      iconPath:    [service?.iconPath ?? GENERIC_SERVICE_ICON],
    }));
  }

  removeService(index: number) {
    this.servicesArr.removeAt(index);
  }

  fillSuggestedServices() {
    this.servicesArr.clear();
    DEFAULT_SERVICE_LIBRARY.forEach(service => this.addService(service));
  }

  addTestimonial(testimonial?: Partial<Testimonial>) {
    this.testimonialsArr.push(this.fb.nonNullable.group({
      name:     [testimonial?.name ?? '', Validators.required],
      location: [testimonial?.location ?? ''],
      rating:   [testimonial?.rating ?? 5],
      review:   [testimonial?.review ?? '', Validators.required],
    }));
  }

  removeTestimonial(index: number) {
    this.testimonialsArr.removeAt(index);
  }

  getStars(index: number): number {
    return (this.testimonialsArr.at(index) as FormGroup).get('rating')?.value as number ?? 5;
  }

  setStars(index: number, stars: number) {
    (this.testimonialsArr.at(index) as FormGroup).get('rating')!.setValue(stars);
    this.markDirty('testimonials');
  }

  hasError(form: FormGroup, name: string, error = 'required'): boolean {
    const control = form.get(name);
    return !!(control?.hasError(error) && (control.dirty || control.touched));
  }

  private get clinicId(): string {
    return this.clinicCfg.config.clinicId ?? '';
  }

  private guardClinicId(): boolean {
    if (!this.clinicId || this.clinicId === 'default') {
      this.showToast('Cannot save - clinic not fully configured.', 'error');
      return false;
    }
    return true;
  }

  async saveInfo() {
    this.infoForm.markAllAsTouched();
    if (this.infoForm.invalid || !this.guardClinicId()) return;

    this.savingInfo.set(true);
    try {
      const values = this.infoForm.getRawValue();
      const doctorBio = values.doctorBio.split('\n').map(item => item.trim()).filter(Boolean);

      await this.store.updateClinicSettings(this.clinicId, {
        name:                values.name.trim(),
        doctorName:          values.doctorName,
        doctorQualification: values.doctorQualification,
        patientCount:        values.patientCount,
        doctorBio,
      });

      this.clinicCfg.updateConfig({
        name:                values.name.trim(),
        doctorName:          values.doctorName,
        doctorQualification: values.doctorQualification || undefined,
        patientCount:        values.patientCount || undefined,
        doctorBio,
      });

      this.clearDirty('info');
      this.showToast('Clinic profile saved.', 'success');
    } catch {
      this.showToast('Failed to save clinic profile.', 'error');
    } finally {
      this.savingInfo.set(false);
    }
  }

  async saveContact() {
    this.contactForm.markAllAsTouched();
    if (this.contactForm.invalid || !this.guardClinicId()) return;

    this.savingContact.set(true);
    try {
      const values = this.contactForm.getRawValue();
      const digits = values.phone.replace(/\D/g, '');
      const e164 = digits.startsWith('91') ? digits : `91${digits}`;

      await this.store.updateClinicSettings(this.clinicId, {
        phone:            values.phone,
        phoneE164:        e164,
        whatsappNumber:   e164,
        addressLine1:     values.addressLine1,
        addressLine2:     values.addressLine2,
        city:             values.city,
        mapEmbedUrl:      values.mapEmbedUrl || undefined,
        mapDirectionsUrl: values.mapDirectionsUrl || undefined,
      });

      this.clinicCfg.updateConfig({
        phone:            values.phone,
        phoneE164:        e164,
        whatsappNumber:   e164,
        addressLine1:     values.addressLine1,
        addressLine2:     values.addressLine2 || undefined,
        city:             values.city,
        mapEmbedUrl:      values.mapEmbedUrl || undefined,
        mapDirectionsUrl: values.mapDirectionsUrl || undefined,
      });

      this.clearDirty('contact');
      this.showToast('Contact details saved.', 'success');
    } catch {
      this.showToast('Failed to save contact details.', 'error');
    } finally {
      this.savingContact.set(false);
    }
  }

  async saveHours() {
    if (!this.guardClinicId()) return;

    this.savingHours.set(true);
    try {
      const hours = (this.hoursForm.getRawValue().hours as Array<{ days: string; time: string }>)
        .filter(slot => slot.days.trim() || slot.time.trim()) as ClinicHours[];

      await this.store.updateClinicSettings(this.clinicId, { hours });
      this.clinicCfg.updateConfig({ hours });

      this.clearDirty('hours');
      this.showToast('Clinic hours saved.', 'success');
    } catch {
      this.showToast('Failed to save clinic hours.', 'error');
    } finally {
      this.savingHours.set(false);
    }
  }

  async saveServices() {
    this.servicesForm.markAllAsTouched();
    if (this.servicesForm.invalid || !this.guardClinicId()) return;

    this.savingServices.set(true);
    try {
      const services = (this.servicesForm.getRawValue().services as Array<{
        name: string;
        description: string;
        benefit: string;
        price: string;
        iconPath: string;
      }>)
        .filter(service =>
          service.name.trim() ||
          service.description.trim() ||
          service.benefit.trim() ||
          service.price.trim())
        .map(service => ({
          ...service,
          name:        service.name.trim(),
          description: service.description.trim(),
          benefit:     service.benefit.trim(),
          price:       service.price.trim(),
          iconPath:    service.iconPath || GENERIC_SERVICE_ICON,
        })) as ClinicService[];

      await this.store.updateClinicSettings(this.clinicId, { services });
      this.clinicCfg.updateConfig({ services });

      this.clearDirty('services');
      this.showToast('Services saved.', 'success');
    } catch {
      this.showToast('Failed to save services.', 'error');
    } finally {
      this.savingServices.set(false);
    }
  }

  async saveTestimonials() {
    this.testimonialsForm.markAllAsTouched();
    if (this.testimonialsForm.invalid || !this.guardClinicId()) return;

    this.savingTestimonials.set(true);
    try {
      const testimonials = this.testimonialsForm.getRawValue().testimonials as Testimonial[];
      await this.store.updateClinicSettings(this.clinicId, { testimonials });
      this.clinicCfg.updateConfig({ testimonials });

      this.clearDirty('testimonials');
      this.showToast('Testimonials saved.', 'success');
    } catch {
      this.showToast('Failed to save testimonials.', 'error');
    } finally {
      this.savingTestimonials.set(false);
    }
  }

  async saveSocial() {
    if (!this.guardClinicId()) return;

    this.savingSocial.set(true);
    try {
      const values = this.socialForm.getRawValue();
      const social = {
        ...(values.facebook ? { facebook: values.facebook } : {}),
        ...(values.instagram ? { instagram: values.instagram } : {}),
        ...(values.linkedin ? { linkedin: values.linkedin } : {}),
      };

      await this.store.updateClinicSettings(this.clinicId, { social });
      this.clinicCfg.updateConfig({ social });

      this.clearDirty('social');
      this.showToast('Social links saved.', 'success');
    } catch {
      this.showToast('Failed to save social links.', 'error');
    } finally {
      this.savingSocial.set(false);
    }
  }

  private guardBrandingAccess(feature: 'theme controls' | 'custom logo uploads'): boolean {
    if (this.canManageBranding) return true;

    this.activeTab.set('subscription');
    this.showToast(`Upgrade to Starter to unlock ${feature}.`, 'error');
    return false;
  }

  private guardVoiceAccess(): boolean {
    if (this.canManageVoice) return true;

    this.activeTab.set('subscription');
    this.upgradeError.set('Upgrade to Pro to unlock the AI Voice Receptionist.');
    this.showToast('Upgrade to Pro to unlock AI Voice Receptionist.', 'error');
    return false;
  }

  pickTheme(theme: ClinicConfig['theme']) {
    if (!this.guardBrandingAccess('theme controls')) return;

    this.selectedTheme.set(theme);
    this.clinicCfg.updateConfig({ theme });

    if (theme === this.persistedTheme()) {
      this.clearDirty('theme');
      return;
    }
    this.markDirty('theme');
  }

  async saveTheme() {
    if (!this.guardClinicId() || !this.guardBrandingAccess('theme controls')) return;

    this.savingTheme.set(true);
    try {
      await this.store.updateClinicSettings(this.clinicId, { theme: this.selectedTheme() });
      this.persistedTheme.set(this.selectedTheme());
      this.clinicCfg.updateConfig({ theme: this.selectedTheme() });
      this.clearDirty('theme');
      this.showToast('Theme saved.', 'success');
    } catch {
      this.showToast('Failed to save theme.', 'error');
    } finally {
      this.savingTheme.set(false);
    }
  }

  async createVoiceAgent() {
    if (!this.guardClinicId() || !this.guardVoiceAccess()) return;

    this.creatingVoiceAgent.set(true);
    try {
      const cfg = this.clinicCfg.config;
      const response = await fetch('/api/elevenlabs?action=create-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId:            this.clinicId,
          name:                cfg.name,
          city:                cfg.city,
          addressLine1:        cfg.addressLine1,
          phone:               cfg.phone,
          doctorName:          cfg.doctorName,
          doctorQualification: cfg.doctorQualification,
          hours:               cfg.hours ?? [],
          services:            cfg.services ?? [],
        }),
      });

      const data = await response.json() as { agentId?: string; error?: string; details?: string };
      if (!response.ok) {
        const message = data.details ?? data.error ?? 'API error';
        console.error('[createVoiceAgent]', message);
        throw new Error(message);
      }

      this.clinicCfg.updateConfig({ elevenLabsAgentId: data.agentId });
      await this.fetchUsage();
      await this.fetchWhatsappAccounts();
      this.showToast('Voice agent created. Your AI receptionist is live.', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.showToast(`Failed: ${message.slice(0, 120)}`, 'error');
    } finally {
      this.creatingVoiceAgent.set(false);
    }
  }

  async fetchUsage() {
    if (!this.canManageVoice) return;

    this.loadingUsage.set(true);
    try {
      const response = await fetch(`/api/elevenlabs?action=usage&clinicId=${this.clinicId}`);
      if (response.ok) this.voiceUsage.set(await response.json());
    } catch {
      // Usage is non-critical.
    } finally {
      this.loadingUsage.set(false);
    }
  }

  async fetchWhatsappAccounts() {
    if (!this.canManageVoice || !this.cfg.elevenLabsAgentId || !this.clinicId || this.clinicId === 'default') return;

    this.loadingWhatsappAccounts.set(true);
    this.whatsappAccountsError.set(null);
    try {
      const response = await fetch(`/api/elevenlabs?action=whatsapp-accounts&clinicId=${encodeURIComponent(this.clinicId)}`);
      const data = await response.json() as {
        items?: WhatsappAccountOption[];
        currentPhoneNumberId?: string | null;
        error?: string;
        details?: string;
      };

      if (!response.ok) {
        throw new Error(data.details ?? data.error ?? 'Failed to load WhatsApp accounts');
      }

      const items = data.items ?? [];
      const currentPhoneNumberId = data.currentPhoneNumberId ?? '';

      this.whatsappAccounts.set(items);
      this.voiceForm.controls.whatsapp.setValue(currentPhoneNumberId, { emitEvent: false });
      this.clinicCfg.updateConfig({
        voiceAgentWhatsapp: currentPhoneNumberId || undefined,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load WhatsApp accounts.';
      this.whatsappAccountsError.set(message);
    } finally {
      this.loadingWhatsappAccounts.set(false);
    }
  }

  isWhatsappAccountLocked(account: WhatsappAccountOption): boolean {
    return !!account.assignedAgentId && account.assignedAgentId !== this.cfg.elevenLabsAgentId;
  }

  async saveVoice() {
    if (!this.guardClinicId() || !this.guardVoiceAccess()) return;

    this.savingVoice.set(true);
    try {
      const values = this.voiceForm.getRawValue();
      const response = await fetch('/api/elevenlabs?action=update-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId: this.clinicId,
          greeting: values.greeting.trim(),
          language: values.language,
          persona:  values.persona.trim(),
          voiceId:  values.voiceId,
          whatsappPhoneNumberId: values.whatsapp.trim(),
        }),
      });

      const data = await response.json() as {
        ok?: boolean;
        error?: string;
        details?: string;
        whatsappAccountId?: string | null;
      };
      if (!response.ok) throw new Error(data.details ?? data.error ?? 'API error');

      this.clinicCfg.updateConfig({
        voiceAgentGreeting: values.greeting.trim() || undefined,
        voiceAgentLanguage: values.language,
        voiceAgentPersona:  values.persona.trim() || undefined,
        voiceAgentVoiceId:  values.voiceId || undefined,
        voiceAgentWhatsapp: data.whatsappAccountId || undefined,
      });

      await this.fetchWhatsappAccounts();
      this.clearDirty('voice');
      this.showToast('Voice agent updated.', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update voice agent.';
      this.showToast(message.slice(0, 140), 'error');
    } finally {
      this.savingVoice.set(false);
    }
  }

  async upgradePlan(plan: BillingPlan, billingCycle: BillingCycle = this.selectedBillingCycle()) {
    if (this.upgrading()) return;

    this.upgrading.set(true);
    this.upgradeError.set(null);
    try {
      const { paymentUrl } = await this.billing.createSubscription(
        this.cfg.clinicId ?? '',
        plan,
        billingCycle,
        this.cfg.name,
        this.cfg.phone,
      );
      window.open(paymentUrl, '_blank', 'noopener');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not initiate payment. Try again.';
      this.upgradeError.set(message);
    } finally {
      this.upgrading.set(false);
    }
  }

  async onLogoFile(event: Event): Promise<void> {
    if (!this.guardBrandingAccess('custom logo uploads')) return;

    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.logoError.set(null);

    if (file.size > 5 * 1024 * 1024) {
      this.logoError.set('File too large - max 5 MB.');
      input.value = '';
      return;
    }

    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'];
    if (!allowed.includes(file.type)) {
      this.logoError.set('Use PNG, JPG, WebP, SVG, or GIF.');
      input.value = '';
      return;
    }

    try {
      const dataUrl = await this.compressLogo(file);
      this.logoPreview.set(dataUrl);
    } catch {
      this.logoError.set('Could not read the image. Try a different file.');
    }

    input.value = '';
  }

  private compressLogo(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      if (file.type === 'image/svg+xml') {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
        return;
      }

      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const maxWidth = 400;
        const maxHeight = 160;
        let width = img.naturalWidth;
        let height = img.naturalHeight;
        const ratio = Math.min(maxWidth / width, maxHeight / height, 1);

        width = Math.round(width * ratio);
        height = Math.round(height * ratio);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);

        const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        resolve(canvas.toDataURL(mime, 0.88));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('load failed'));
      };
      img.src = url;
    });
  }

  async saveLogo(): Promise<void> {
    const dataUrl = this.logoPreview();
    if (!dataUrl || !this.guardClinicId() || !this.guardBrandingAccess('custom logo uploads')) return;

    this.savingLogo.set(true);
    try {
      await this.store.updateClinicSettings(this.clinicId, { logoDataUrl: dataUrl });
      this.clinicCfg.updateConfig({ logoDataUrl: dataUrl });
      this.logoPreview.set(null);
      this.showToast('Logo saved - now live on your website.', 'success');
    } catch {
      this.showToast('Failed to save logo. Try again.', 'error');
    } finally {
      this.savingLogo.set(false);
    }
  }

  async removeLogo(): Promise<void> {
    if (!this.guardClinicId() || !this.guardBrandingAccess('custom logo uploads')) return;

    this.savingLogo.set(true);
    try {
      await this.store.updateClinicSettings(this.clinicId, { logoDataUrl: null });
      this.clinicCfg.updateConfig({ logoDataUrl: undefined });
      this.logoPreview.set(null);
      this.showToast('Logo removed - default icon restored.', 'success');
    } catch {
      this.showToast('Failed to remove logo.', 'error');
    } finally {
      this.savingLogo.set(false);
    }
  }

  private showToast(msg: string, type: 'success' | 'error') {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast.set({ msg, type });
    this.toastTimer = setTimeout(() => this.toast.set(null), 2500);
  }
}
