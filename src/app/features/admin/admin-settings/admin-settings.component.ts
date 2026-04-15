import {
  Component, signal, ChangeDetectionStrategy,
  inject, OnInit, DestroyRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ReactiveFormsModule, FormBuilder, FormArray, FormGroup, Validators,
} from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { ClinicConfigService } from '../../../core/services/clinic-config.service';
import { ClinicFirestoreService } from '../../../core/services/clinic-firestore.service';
import { Testimonial, ClinicHours, ClinicConfig } from '../../../core/config/clinic.config';
import { BillingService, BillingPlan } from '../../../core/services/billing.service';

type TabId = 'info' | 'contact' | 'hours' | 'testimonials' | 'social' | 'theme' | 'subscription' | 'voice';

export interface ThemeOption {
  value: ClinicConfig['theme'];
  label: string;
  primary: string;
  dark: string;
  light: string;
  gradient: string;
}

@Component({
  selector: 'app-admin-settings',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './admin-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSettingsComponent implements OnInit {
  private clinicCfg  = inject(ClinicConfigService);
  private store      = inject(ClinicFirestoreService);
  private billing    = inject(BillingService);
  private fb         = inject(FormBuilder);
  private route      = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);

  // ── State signals ─────────────────────────────────────────────────────────
  loading            = signal(true);
  upgrading          = signal(false);
  upgradeError       = signal<string | null>(null);
  activeTab          = signal<TabId>('info');
  savingInfo         = signal(false);
  savingContact      = signal(false);
  savingHours        = signal(false);
  savingTestimonials = signal(false);
  savingSocial       = signal(false);
  dirtyTabs          = signal<Set<TabId>>(new Set());
  toast = signal<{ msg: string; type: 'success' | 'error' } | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  readonly tabs: Array<{ id: TabId; label: string }> = [
    { id: 'info',         label: 'Clinic Info' },
    { id: 'contact',      label: 'Contact' },
    { id: 'hours',        label: 'Hours' },
    { id: 'testimonials', label: 'Testimonials' },
    { id: 'social',       label: 'Social' },
    { id: 'theme',        label: 'Theme' },
    { id: 'subscription', label: '⚡ Plan' },
    { id: 'voice',        label: '🎙 Voice Agent' },
  ];

  // ── Dirty tracking helpers ────────────────────────────────────────────────
  markDirty(tab: TabId)  { this.dirtyTabs.update(s => new Set([...s, tab])); }
  clearDirty(tab: TabId) { this.dirtyTabs.update(s => { const n = new Set(s); n.delete(tab); return n; }); }
  isTabDirty(tab: TabId) { return this.dirtyTabs().has(tab); }

  // ── Subscription helpers ──────────────────────────────────────────────────
  get cfg() { return this.clinicCfg.config; }
  get plan()   { return this.cfg.subscriptionPlan   ?? 'trial'; }
  get planStatus() { return this.cfg.subscriptionStatus ?? 'trial'; }
  get trialDaysLeft(): number {
    if (!this.cfg.trialEndDate) return 30;
    const end = new Date(this.cfg.trialEndDate).getTime();
    return Math.max(0, Math.ceil((end - Date.now()) / 86_400_000));
  }
  get isExpired()  { return this.planStatus === 'expired' || (this.planStatus === 'trial' && this.trialDaysLeft <= 0); }
  get isTrial()    { return this.planStatus === 'trial' && this.trialDaysLeft > 0; }
  get isStarter()  { return this.plan === 'starter' && this.planStatus === 'active'; }
  get isPro()      { return this.plan === 'pro' && this.planStatus === 'active'; }

  readonly PLANS = [
    {
      id: 'trial', label: 'Free Trial', price: '₹0', period: '30 days',
      color: 'gray',
      features: ['Clinic website', 'Online booking', 'WhatsApp integration', 'Patient admin dashboard', 'Free subdomain'],
      locked: ['Custom domain', 'AI Voice Receptionist', 'Google Reviews sync', 'SEO-optimised pages'],
    },
    {
      id: 'starter', label: 'Starter', price: '₹499', period: '/month',
      color: 'blue',
      features: ['Everything in Trial', 'Custom domain setup', 'Free SSL certificate', 'Services catalogue', 'Priority WhatsApp support', '1 content update/month'],
      locked: ['AI Voice Receptionist', 'Google Reviews sync', 'SEO-optimised pages', 'Unlimited updates'],
    },
    {
      id: 'pro', label: 'Pro', price: '₹999', period: '/month',
      color: 'purple',
      features: ['Everything in Starter', 'AI Voice Receptionist 24/7', 'Hindi + English voice', 'Google Reviews sync', 'Testimonials management', 'SEO-optimised pages', 'Google Analytics setup', 'Unlimited content updates', 'Priority support'],
      locked: [],
    },
  ] as const;

  readonly themeOptions: ThemeOption[] = [
    { value: 'blue',    label: 'Sapphire',      primary: '#1E56DC', dark: '#1235A9', light: '#EBF2FF', gradient: 'linear-gradient(135deg,#1E56DC,#3B7BF8)' },
    { value: 'teal',    label: 'Teal Precision', primary: '#0B7285', dark: '#085E6F', light: '#ECFEFF', gradient: 'linear-gradient(135deg,#0B7285,#0EA5C4)' },
    { value: 'emerald', label: 'Forest',         primary: '#047857', dark: '#065F46', light: '#ECFDF5', gradient: 'linear-gradient(135deg,#047857,#059669)' },
    { value: 'purple',  label: 'Royal Indigo',   primary: '#4338CA', dark: '#3730A3', light: '#EEF2FF', gradient: 'linear-gradient(135deg,#4338CA,#6366F1)' },
    { value: 'rose',    label: 'Crimson',        primary: '#BE123C', dark: '#9F1239', light: '#FFF1F2', gradient: 'linear-gradient(135deg,#BE123C,#E11D48)' },
    { value: 'caramel', label: 'Amber Gold',     primary: '#B45309', dark: '#92400E', light: '#FFFBEB', gradient: 'linear-gradient(135deg,#B45309,#D97706)' },
  ];

  selectedTheme = signal<ClinicConfig['theme']>('blue');
  savingTheme   = signal(false);

  readonly STARS = [1, 2, 3, 4, 5] as const;

  // ── Forms ─────────────────────────────────────────────────────────────────
  infoForm = this.fb.nonNullable.group({
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
    voiceId:   ['9BWtsMINqrJLrRacOk9x'],  // default: Aria
    whatsapp:  [''],
  });

  savingVoice        = signal(false);
  creatingVoiceAgent = signal(false);
  voiceUsage         = signal<{ conversations: number; minutesUsed: number; minutesLimit: number } | null>(null);
  loadingUsage       = signal(false);

  // Curated voices — all support eleven_multilingual_v2 (Hindi + English)
  readonly VOICE_OPTIONS = [
    { id: '9BWtsMINqrJLrRacOk9x', name: 'Aria',      gender: 'Female', style: 'Warm & professional' },
    { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah',     gender: 'Female', style: 'Soft & reassuring' },
    { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura',     gender: 'Female', style: 'Upbeat & friendly' },
    { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', gender: 'Female', style: 'Confident & clear' },
    { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger',     gender: 'Male',   style: 'Deep & trustworthy' },
    { id: 'SAz9YHcvj6GT2YYXdXww', name: 'River',     gender: 'Neutral', style: 'Calm & balanced' },
  ] as const;

  // ── FormArray getters ─────────────────────────────────────────────────────
  get hoursArr()        { return this.hoursForm.controls.hours as FormArray; }
  get testimonialsArr() { return this.testimonialsForm.controls.testimonials as FormArray; }

  // Expose Math to templates
  readonly Math = Math;

  // ── Star rating helpers ───────────────────────────────────────────────────
  getStars(i: number): number {
    return (this.testimonialsArr.at(i) as FormGroup).get('rating')?.value as number ?? 5;
  }

  setStars(i: number, stars: number) {
    (this.testimonialsArr.at(i) as FormGroup).get('rating')!.setValue(stars);
    this.markDirty('testimonials');
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit() {
    const tab = this.route.snapshot.queryParamMap.get('tab') as TabId | null;
    if (tab && this.tabs.some(t => t.id === tab)) this.activeTab.set(tab);

    const cfg = this.clinicCfg.config;

    this.infoForm.patchValue({
      doctorName:          cfg.doctorName          ?? '',
      doctorQualification: cfg.doctorQualification ?? '',
      patientCount:        cfg.patientCount        ?? '',
      doctorBio:           (cfg.doctorBio ?? []).join('\n'),
    });

    this.contactForm.patchValue({
      phone:            cfg.phone            ?? '',
      addressLine1:     cfg.addressLine1     ?? '',
      addressLine2:     cfg.addressLine2     ?? '',
      city:             cfg.city             ?? '',
      mapEmbedUrl:      cfg.mapEmbedUrl      ?? '',
      mapDirectionsUrl: cfg.mapDirectionsUrl ?? '',
    });

    this.selectedTheme.set(cfg.theme ?? 'blue');

    (cfg.hours        ?? []).forEach(h => this.addHour(h.days, h.time));
    (cfg.testimonials ?? []).forEach(t => this.addTestimonial(t));

    this.socialForm.patchValue({
      facebook:  cfg.social?.facebook  ?? '',
      instagram: cfg.social?.instagram ?? '',
      linkedin:  cfg.social?.linkedin  ?? '',
    });

    this.voiceForm.patchValue({
      greeting: cfg.voiceAgentGreeting ?? '',
      language: cfg.voiceAgentLanguage ?? 'bilingual',
      persona:  cfg.voiceAgentPersona  ?? '',
      voiceId:  cfg.voiceAgentVoiceId  ?? '9BWtsMINqrJLrRacOk9x',
      whatsapp: cfg.voiceAgentWhatsapp ?? '',
    });
    // Load usage stats if agent exists
    if (cfg.elevenLabsAgentId && cfg.clinicId && cfg.clinicId !== 'default') {
      this.fetchUsage();
    }

    this.loading.set(false);

    // Subscribe to valueChanges AFTER patchValue so initial load doesn't dirty tabs
    this.infoForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.markDirty('info'));
    this.contactForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.markDirty('contact'));
    this.hoursForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.markDirty('hours'));
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

  // ── FormArray helpers ─────────────────────────────────────────────────────
  addHour(days = '', time = '') {
    this.hoursArr.push(this.fb.nonNullable.group({ days: [days], time: [time] }));
  }
  removeHour(i: number) { this.hoursArr.removeAt(i); }

  addTestimonial(t?: Partial<Testimonial>) {
    this.testimonialsArr.push(this.fb.nonNullable.group({
      name:     [t?.name     ?? '', Validators.required],
      location: [t?.location ?? ''],
      rating:   [t?.rating   ?? 5],
      review:   [t?.review   ?? '', Validators.required],
    }));
  }
  removeTestimonial(i: number) { this.testimonialsArr.removeAt(i); }

  // ── Control error helper for template ────────────────────────────────────
  hasError(form: FormGroup, name: string, error = 'required'): boolean {
    const c = form.get(name);
    return !!(c?.hasError(error) && (c.dirty || c.touched));
  }

  // ── clinicId (safe resolution) ────────────────────────────────────────────
  private get clinicId(): string { return this.clinicCfg.config.clinicId ?? ''; }

  private guardClinicId(): boolean {
    if (!this.clinicId || this.clinicId === 'default') {
      this.showToast('Cannot save — clinic not fully configured.', 'error');
      return false;
    }
    return true;
  }

  // ── Save methods ──────────────────────────────────────────────────────────
  async saveInfo() {
    this.infoForm.markAllAsTouched();
    if (this.infoForm.invalid || !this.guardClinicId()) return;
    this.savingInfo.set(true);
    try {
      const v = this.infoForm.getRawValue();
      await this.store.updateClinicSettings(this.clinicId, {
        doctorName:          v.doctorName,
        doctorQualification: v.doctorQualification,
        patientCount:        v.patientCount,
        doctorBio:           v.doctorBio.split('\n').map(s => s.trim()).filter(Boolean),
      });
      this.clearDirty('info');
      this.showToast('Clinic info saved.', 'success');
    } catch { this.showToast('Failed to save. Please try again.', 'error'); }
    finally   { this.savingInfo.set(false); }
  }

  async saveContact() {
    this.contactForm.markAllAsTouched();
    if (this.contactForm.invalid || !this.guardClinicId()) return;
    this.savingContact.set(true);
    try {
      const v      = this.contactForm.getRawValue();
      const digits = v.phone.replace(/\D/g, '');
      const e164   = digits.startsWith('91') ? digits : `91${digits}`;
      await this.store.updateClinicSettings(this.clinicId, {
        phone:            v.phone,
        phoneE164:        e164,
        whatsappNumber:   e164,
        addressLine1:     v.addressLine1,
        addressLine2:     v.addressLine2,
        city:             v.city,
        mapEmbedUrl:      v.mapEmbedUrl     || undefined,
        mapDirectionsUrl: v.mapDirectionsUrl || undefined,
      });
      this.clearDirty('contact');
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
      this.clearDirty('hours');
      this.showToast('Clinic hours saved.', 'success');
    } catch { this.showToast('Failed to save. Please try again.', 'error'); }
    finally   { this.savingHours.set(false); }
  }

  async saveTestimonials() {
    this.testimonialsForm.markAllAsTouched();
    if (this.testimonialsForm.invalid || !this.guardClinicId()) return;
    this.savingTestimonials.set(true);
    try {
      await this.store.updateClinicSettings(this.clinicId, {
        testimonials: this.testimonialsForm.getRawValue().testimonials as Testimonial[],
      });
      this.clearDirty('testimonials');
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
      this.clearDirty('social');
      this.showToast('Social links saved.', 'success');
    } catch { this.showToast('Failed to save. Please try again.', 'error'); }
    finally   { this.savingSocial.set(false); }
  }

  pickTheme(theme: ClinicConfig['theme']) {
    this.selectedTheme.set(theme);
    this.clinicCfg.updateConfig({ theme }); // live preview
  }

  async saveTheme() {
    if (!this.guardClinicId()) return;
    this.savingTheme.set(true);
    try {
      await this.store.updateClinicSettings(this.clinicId, { theme: this.selectedTheme() });
      this.showToast('Theme saved.', 'success');
    } catch { this.showToast('Failed to save theme.', 'error'); }
    finally   { this.savingTheme.set(false); }
  }

  // ── Voice Agent ───────────────────────────────────────────────────────────
  async createVoiceAgent() {
    if (!this.guardClinicId()) return;
    this.creatingVoiceAgent.set(true);
    try {
      const cfg = this.clinicCfg.config;
      const res = await fetch('/api/elevenlabs-create-agent', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId:            this.clinicId,
          name:                cfg.name,
          city:                cfg.city,
          addressLine1:        cfg.addressLine1,
          phone:               cfg.phone,
          doctorName:          cfg.doctorName,
          doctorQualification: cfg.doctorQualification,
          hours:               cfg.hours    ?? [],
          services:            cfg.services ?? [],
        }),
      });
      const data = await res.json() as { agentId?: string; error?: string; details?: string };
      if (!res.ok) {
        const msg = data.details ?? data.error ?? 'API error';
        console.error('[createVoiceAgent]', msg);
        throw new Error(msg);
      }
      this.clinicCfg.updateConfig({ elevenLabsAgentId: data.agentId });
      this.showToast('Voice agent created! Your AI receptionist is live.', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      this.showToast(`Failed: ${msg.slice(0, 120)}`, 'error');
    } finally {
      this.creatingVoiceAgent.set(false);
    }
  }

  async fetchUsage() {
    this.loadingUsage.set(true);
    try {
      const res = await fetch(`/api/elevenlabs-usage?clinicId=${this.clinicId}`);
      if (res.ok) this.voiceUsage.set(await res.json());
    } catch { /* silent — usage is non-critical */ }
    finally { this.loadingUsage.set(false); }
  }

  async saveVoice() {
    if (!this.guardClinicId()) return;
    this.savingVoice.set(true);
    try {
      const v = this.voiceForm.getRawValue();
      const res = await fetch('/api/elevenlabs-update-agent', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId: this.clinicId,
          greeting: v.greeting || undefined,
          language: v.language,
          persona:  v.persona  || undefined,
          voiceId:  v.voiceId  || undefined,
          whatsapp: v.whatsapp || undefined,
        }),
      });
      if (!res.ok) throw new Error('API error');
      this.clinicCfg.updateConfig({
        voiceAgentGreeting: v.greeting || undefined,
        voiceAgentLanguage: v.language,
        voiceAgentPersona:  v.persona  || undefined,
        voiceAgentVoiceId:  v.voiceId  || undefined,
        voiceAgentWhatsapp: v.whatsapp || undefined,
      });
      this.clearDirty('voice');
      this.showToast('Voice agent updated.', 'success');
    } catch {
      this.showToast('Failed to update voice agent.', 'error');
    } finally {
      this.savingVoice.set(false);
    }
  }

  // ── Subscription / Billing ───────────────────────────────────────────────
  async upgradePlan(plan: BillingPlan) {
    if (this.upgrading()) return;
    this.upgrading.set(true);
    this.upgradeError.set(null);
    try {
      const { shortUrl } = await this.billing.createSubscription(
        this.cfg.clinicId ?? '',
        plan,
        this.cfg.name,
        this.cfg.phone,
      );
      // Redirect the clinic owner to the Razorpay hosted payment page
      window.open(shortUrl, '_blank', 'noopener');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not initiate payment. Try again.';
      this.upgradeError.set(msg);
    } finally {
      this.upgrading.set(false);
    }
  }

  // ── Toast ─────────────────────────────────────────────────────────────────
  private showToast(msg: string, type: 'success' | 'error') {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast.set({ msg, type });
    this.toastTimer = setTimeout(() => this.toast.set(null), 2500);
  }
}
