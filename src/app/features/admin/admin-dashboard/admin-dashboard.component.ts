import {
  Component, signal, computed, ChangeDetectionStrategy,
  inject, OnInit, OnDestroy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { AppointmentService, Appointment, PaymentStatus, PaymentMethod } from '../../../core/services/appointment.service';
import { ClinicConfigService } from '../../../core/services/clinic-config.service';

const THEME_COLORS: Record<string, { hex: string; hexLight: string; textClass: string; bgClass: string }> = {
  blue:    { hex: '#1E56DC', hexLight: '#EBF2FF', textClass: 'text-blue-700',    bgClass: 'bg-blue-700'    },
  teal:    { hex: '#0B7285', hexLight: '#ECFEFF', textClass: 'text-cyan-700',    bgClass: 'bg-cyan-700'    },
  emerald: { hex: '#047857', hexLight: '#ECFDF5', textClass: 'text-emerald-700', bgClass: 'bg-emerald-700' },
  purple:  { hex: '#4338CA', hexLight: '#EEF2FF', textClass: 'text-indigo-700',  bgClass: 'bg-indigo-700'  },
  rose:    { hex: '#BE123C', hexLight: '#FFF1F2', textClass: 'text-rose-700',    bgClass: 'bg-rose-700'    },
  caramel: { hex: '#B45309', hexLight: '#FFFBEB', textClass: 'text-amber-700',   bgClass: 'bg-amber-700'   },
};

export type FilterTab = 'all' | 'pending' | 'confirmed' | 'today' | 'checked_in' | 'completed';

export const CANCEL_REASONS = [
  'Patient request',
  'Doctor unavailable',
  'Rescheduled',
  'No response from patient',
  'Emergency closure',
  'Other',
] as const;
export type CancelReason = typeof CANCEL_REASONS[number];

type UpgradeTeaser = {
  icon: 'palette' | 'badge' | 'globe' | 'mic' | 'whatsapp' | 'moon';
  color: 'blue' | 'emerald' | 'teal' | 'purple';
  plan: 'Starter' | 'Pro';
  title: string;
  desc: string;
  cta: string;
};

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [RouterLink, FormsModule, DecimalPipe],
  templateUrl: './admin-dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
  private auth               = inject(AuthService);
  private appointmentService = inject(AppointmentService);
  private router             = inject(Router);
  readonly clinic            = inject(ClinicConfigService);
  readonly clinicConfig      = this.clinic.config;

  // ── Core state ───────────────────────────────────────────────────────────
  appointments    = signal<Appointment[]>([]);
  loading         = signal(true);
  activeTab       = signal<FilterTab>('all');
  actionError     = signal<string | null>(null);
  actionSuccess   = signal<string | null>(null);
  updatingId      = signal<string | null>(null);
  sidebarOpen     = signal(false);

  // ── Search & filter ──────────────────────────────────────────────────────
  searchQuery     = signal('');
  dateFrom        = signal('');
  dateTo          = signal('');
  showFilters     = signal(false);

  // ── Cancel reason modal ──────────────────────────────────────────────────
  cancelTarget    = signal<Appointment | null>(null);  // appointment to cancel
  cancelReason    = signal<CancelReason | ''>('');
  readonly cancelReasons = CANCEL_REASONS;

  // ── Appointment detail panel ─────────────────────────────────────────────
  detailAppt      = signal<Appointment | null>(null);  // selected for detail view

  // ── Clinical notes editing (inside detail panel) ──────────────────────────
  editingNotes  = signal(false);
  savingNotes   = signal(false);
  notesForm     = signal({
    clinicNotes:   '',
    treatmentDone: '',
    amountCharged: '',
    paymentStatus: '' as PaymentStatus | '',
    paymentMethod: '' as PaymentMethod | '',
  });

  today = new Date().toISOString().split('T')[0];
  private errorTimer:   ReturnType<typeof setTimeout> | null = null;
  private successTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribeAppointments: (() => void) | null = null;

  adminEmail = computed(() => this.auth.currentUser()?.email ?? '');

  get themeColor() {
    return THEME_COLORS[this.clinicConfig.theme ?? 'blue'] ?? THEME_COLORS['blue'];
  }

  get greeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  get todayFormatted(): string {
    return new Date().toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  }

  get doctorFirstName(): string {
    const name = this.clinicConfig.doctorName?.trim();
    if (!name) return '';
    const parts = name.split(' ');
    return parts[parts.length - 1] || name;
  }

  /** Returns "Dr. Smith" when doctor name is set, or just the clinic name otherwise */
  get greetingLine(): string {
    return this.doctorFirstName
      ? `Dr. ${this.doctorFirstName}`
      : (this.clinicConfig.name || 'there');
  }

  get websiteUrl(): string {
    const domain = this.clinicConfig.domain?.trim() || this.clinicConfig.vercelDomain?.trim();
    return domain ? `https://${domain}` : '';
  }

  patientInitials(name: string): string {
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  // ── Computed: base list filtered by tab, then by search + date ───────────
  private tabFiltered = computed(() => {
    const all = this.appointments();
    const tab = this.activeTab();
    if (tab === 'today')      return all.filter(a => a.date === this.today);
    if (tab === 'pending')    return all.filter(a => a.status === 'pending');
    if (tab === 'confirmed')  return all.filter(a => a.status === 'confirmed');
    if (tab === 'checked_in') return all.filter(a => a.status === 'checked_in');
    if (tab === 'completed')  return all.filter(a => a.status === 'completed');
    return all;
  });

  filteredAppointments = computed(() => {
    let list = this.tabFiltered();
    const q  = this.searchQuery().trim().toLowerCase();
    const df = this.dateFrom();
    const dt = this.dateTo();

    if (q) {
      list = list.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.phone.includes(q) ||
        a.service.toLowerCase().includes(q) ||
        (a.bookingRef ?? '').toLowerCase().includes(q),
      );
    }
    if (df) list = list.filter(a => a.date >= df);
    if (dt) list = list.filter(a => a.date <= dt);
    return list;
  });

  counts = computed(() => ({
    all:        this.appointments().length,
    today:      this.appointments().filter(a => a.date === this.today).length,
    pending:    this.appointments().filter(a => a.status === 'pending').length,
    confirmed:  this.appointments().filter(a => a.status === 'confirmed').length,
    checked_in: this.appointments().filter(a => a.status === 'checked_in').length,
    completed:  this.appointments().filter(a => a.status === 'completed').length,
  }));

  activeAppointments = computed(() =>
    this.appointments().filter(a => a.status !== 'cancelled' && a.status !== 'no_show'),
  );

  todayAppointmentsList = computed(() =>
    this.activeAppointments()
      .filter(a => a.date === this.today)
      .sort((a, b) => this.timeToMinutes(a.time) - this.timeToMinutes(b.time)),
  );

  todayQueue = computed(() => ({
    scheduled: this.todayAppointmentsList().length,
    pending: this.todayAppointmentsList().filter(a => a.status === 'pending').length,
    inClinic: this.todayAppointmentsList().filter(a => a.status === 'checked_in').length,
    completed: this.todayAppointmentsList().filter(a => a.status === 'completed').length,
  }));

  agendaPreview = computed(() => this.todayAppointmentsList().slice(0, 5));

  nextAppointment = computed(() => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    return this.todayAppointmentsList().find(
      a => this.timeToMinutes(a.time) >= currentMinutes && a.status !== 'completed',
    ) ?? this.todayAppointmentsList().find(a => a.status !== 'completed') ?? null;
  });

  paidRevenue = computed(() =>
    this.appointments().reduce((sum, appt) =>
      appt.paymentStatus === 'paid' ? sum + (appt.amountCharged ?? 0) : sum, 0),
  );

  todayCollectedRevenue = computed(() =>
    this.todayAppointmentsList().reduce((sum, appt) =>
      appt.paymentStatus === 'paid' || appt.paymentStatus === 'partial'
        ? sum + (appt.amountCharged ?? 0)
        : sum, 0),
  );

  outstandingRevenue = computed(() =>
    this.appointments().reduce((sum, appt) =>
      appt.paymentStatus === 'unpaid' || appt.paymentStatus === 'partial'
        ? sum + (appt.amountCharged ?? 0)
        : sum, 0),
  );

  unpaidAppointments = computed(() =>
    this.appointments().filter(a => a.paymentStatus === 'unpaid').length,
  );

  partialPayments = computed(() =>
    this.appointments().filter(a => a.paymentStatus === 'partial').length,
  );

  completionRate = computed(() => {
    const trackable = this.activeAppointments().filter(a =>
      a.status === 'pending'
      || a.status === 'confirmed'
      || a.status === 'checked_in'
      || a.status === 'completed',
    );
    if (!trackable.length) return 0;
    return Math.round((trackable.filter(a => a.status === 'completed').length / trackable.length) * 100);
  });

  hasActiveFilters = computed(() =>
    this.searchQuery().trim().length > 0 || this.dateFrom() !== '' || this.dateTo() !== '',
  );

  // ── Onboarding checklist ─────────────────────────────────────────────────
  onboardingItems = computed(() => {
    const cfg = this.clinic.config;
    return [
      {
        key:   'profile',
        label: 'Complete your clinic profile',
        hint:  'Add doctor name, qualification, and bio',
        done:  !!(cfg.doctorName?.trim() && cfg.doctorQualification?.trim()),
        link:  '/business/clinic/settings',
      },
      {
        key:   'contact',
        label: 'Add contact & address details',
        hint:  'Phone number and clinic address',
        done:  !!(cfg.phone?.trim() && cfg.addressLine1?.trim()),
        link:  '/business/clinic/settings',
      },
      {
        key:   'hours',
        label: 'Set your clinic hours',
        hint:  'Let patients know when you\'re open',
        done:  (cfg.hours?.length ?? 0) > 0,
        link:  '/business/clinic/settings',
      },
      {
        key:   'services',
        label: 'Add your services',
        hint:  'List treatments and pricing',
        done:  (cfg.services?.length ?? 0) > 0,
        link:  '/business/clinic/settings',
      },
      {
        key:   'share',
        label: 'Share your website with patients',
        hint:  'Send your unique link to 5 patients',
        done:  !!(cfg.onboardingSharedWebsite),
        link:  null, // handled by button
      },
    ];
  });

  onboardingDoneCount  = computed(() => this.onboardingItems().filter(i => i.done).length);
  onboardingTotal      = computed(() => this.onboardingItems().length);
  onboardingPct        = computed(() => Math.round((this.onboardingDoneCount() / this.onboardingTotal()) * 100));
  onboardingAllDone    = computed(() => this.onboardingDoneCount() === this.onboardingTotal());

  showOnboarding = computed(() =>
    !this.clinic.config.onboardingDismissed && !this.onboardingAllDone(),
  );

  async dismissOnboarding() {
    await this.clinic.saveOnboardingFlag('onboardingDismissed');
  }

  async markSharedWebsite() {
    await this.clinic.saveOnboardingFlag('onboardingSharedWebsite');
  }

  // ── Subscription helpers ─────────────────────────────────────────────────
  get plan()   { return this.clinicConfig.subscriptionPlan   ?? 'trial'; }
  get status() { return this.clinicConfig.subscriptionStatus ?? 'trial'; }

  get trialDaysLeft(): number {
    if (!this.clinicConfig.trialEndDate) return 30;
    const end = new Date(this.clinicConfig.trialEndDate).getTime();
    return Math.max(0, Math.ceil((end - Date.now()) / 86_400_000));
  }

  get isExpired()       { return this.status === 'expired' || (this.status === 'trial' && this.trialDaysLeft <= 0); }
  get isTrialUrgent()   { return this.status === 'trial' && this.trialDaysLeft > 0 && this.trialDaysLeft <= 7; }
  get isTrial()         { return this.status === 'trial' && this.trialDaysLeft > 0; }
  get isStarter()       { return this.plan === 'starter' && this.status === 'active'; }
  get isPro()           { return this.plan === 'pro' && this.status === 'active'; }
  get showUpgradeBanner() { return !this.isPro; }
  get upgradeHeading() { return this.isStarter ? 'Unlock with Pro' : 'Grow with Starter'; }
  get upgradeLinkLabel() { return this.isStarter ? 'See Pro plan →' : 'See Starter plan →'; }
  get upgradeTeasers(): UpgradeTeaser[] {
    if (this.isStarter) {
      return [
        {
          icon: 'mic',
          color: 'purple',
          plan: 'Pro',
          title: 'AI Voice Receptionist',
          desc: 'Answers calls in Hindi and English, books appointments, and handles after-hours enquiries.',
          cta: 'Unlock with Pro',
        },
        {
          icon: 'whatsapp',
          color: 'emerald',
          plan: 'Pro',
          title: 'WhatsApp AI Replies',
          desc: 'Let your clinic AI answer inbound WhatsApp messages from one business number automatically.',
          cta: 'Upgrade to Pro',
        },
        {
          icon: 'moon',
          color: 'teal',
          plan: 'Pro',
          title: 'Missed-Call Recovery',
          desc: 'Capture leads when the clinic is closed and convert more enquiries into booked appointments.',
          cta: 'Get Pro Automation',
        },
      ];
    }

    return [
      {
        icon: 'badge',
        color: 'emerald',
        plan: 'Starter',
        title: 'Custom Logo',
        desc: 'Replace the default launch mark with your clinic logo across the website and booking flow.',
        cta: 'Upgrade to Starter',
      },
      {
        icon: 'palette',
        color: 'blue',
        plan: 'Starter',
        title: 'Brand Theme Controls',
        desc: 'Choose your dental color palette and make every CTA look like your own clinic brand.',
        cta: 'Unlock Branding',
      },
      {
        icon: 'globe',
        color: 'teal',
        plan: 'Starter',
        title: 'Custom Domain',
        desc: 'Move from the free subdomain to your clinic domain for better trust and stronger marketing.',
        cta: 'Own Your Domain',
      },
    ];
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────
  ngOnInit() { this.startRealtimeSync(); }

  ngOnDestroy() {
    this.unsubscribeAppointments?.();
    if (this.errorTimer)   clearTimeout(this.errorTimer);
    if (this.successTimer) clearTimeout(this.successTimer);
  }

  /**
   * Alias for startRealtimeSync — used by the "Refresh" button in the template.
   * With onSnapshot the data is already live; calling this re-subscribes and
   * resets the loading spinner which gives a visible "refresh" feel.
   */
  loadAppointments() { this.startRealtimeSync(); }

  /**
   * Opens a Firestore onSnapshot listener so the dashboard updates in real
   * time whenever a patient books or an admin changes a status — no refresh
   * required. The listener is torn down in ngOnDestroy.
   */
  startRealtimeSync() {
    this.loading.set(true);
    this.unsubscribeAppointments = this.appointmentService.subscribeToAppointments(
      (appointments) => {
        this.appointments.set(appointments);
        this.loading.set(false);
      },
      () => {
        this.setError('Real-time sync failed. Reload to retry.');
        this.loading.set(false);
      },
    );
  }

  // ── Error / success banners with auto-clear ──────────────────────────────
  private setError(msg: string) {
    if (this.errorTimer) clearTimeout(this.errorTimer);
    this.actionError.set(msg);
    this.errorTimer = setTimeout(() => this.actionError.set(null), 5000);
  }

  private setSuccess(msg: string) {
    if (this.successTimer) clearTimeout(this.successTimer);
    this.actionSuccess.set(msg);
    this.successTimer = setTimeout(() => this.actionSuccess.set(null), 3000);
  }

  // ── Status actions ────────────────────────────────────────────────────────
  async confirm(appt: Appointment) {
    await this.transition(appt, 'confirmed', `${appt.name}'s appointment confirmed.`);
  }

  async markArrived(appt: Appointment) {
    await this.transition(appt, 'checked_in', `${appt.name} marked as arrived.`);
  }

  async markCompleted(appt: Appointment) {
    await this.transition(appt, 'completed', `${appt.name}'s appointment completed.`);
    // If detail panel is open for this appointment, update it
    if (this.detailAppt()?.id === appt.id) {
      this.detailAppt.update(a => a ? { ...a, status: 'completed' } : null);
    }
  }

  async markNoShow(appt: Appointment) {
    await this.transition(appt, 'no_show', `${appt.name} marked as no-show.`);
  }

  private async transition(appt: Appointment, status: 'confirmed' | 'checked_in' | 'completed' | 'no_show' | 'cancelled', successMsg: string) {
    this.updatingId.set(appt.id!);
    this.actionError.set(null);
    try {
      await this.appointmentService.setStatus(appt.id!, status);
      this.appointments.update(list =>
        list.map(a => a.id === appt.id ? { ...a, status } : a),
      );
      if (this.detailAppt()?.id === appt.id) {
        this.detailAppt.update(a => a ? { ...a, status } : null);
      }
      this.setSuccess(successMsg);
    } catch {
      this.setError(`Could not update appointment.`);
    } finally {
      this.updatingId.set(null);
    }
  }

  // ── Cancel with reason ───────────────────────────────────────────────────
  requestCancel(appt: Appointment) {
    this.cancelTarget.set(appt);
    this.cancelReason.set('');
  }

  dismissCancel() {
    this.cancelTarget.set(null);
    this.cancelReason.set('');
  }

  async confirmCancel() {
    const appt = this.cancelTarget();
    if (!appt) return;
    this.cancelTarget.set(null);
    this.updatingId.set(appt.id!);
    this.actionError.set(null);
    try {
      await this.appointmentService.setStatus(appt.id!, 'cancelled');
      this.appointments.update(list =>
        list.map(a => a.id === appt.id ? { ...a, status: 'cancelled' } : a),
      );
      if (this.detailAppt()?.id === appt.id) {
        this.detailAppt.update(a => a ? { ...a, status: 'cancelled' } : null);
      }
      this.setSuccess(`${appt.name}'s appointment cancelled.`);
    } catch {
      this.setError('Could not cancel appointment.');
    } finally {
      this.updatingId.set(null);
      this.cancelReason.set('');
    }
  }

  // ── Detail panel ─────────────────────────────────────────────────────────
  openDetail(appt: Appointment) {
    this.detailAppt.set(appt);
    this.editingNotes.set(false);
    this.notesForm.set({
      clinicNotes:   appt.clinicNotes   ?? '',
      treatmentDone: appt.treatmentDone ?? '',
      amountCharged: appt.amountCharged != null ? String(appt.amountCharged) : '',
      paymentStatus: appt.paymentStatus ?? '',
      paymentMethod: appt.paymentMethod ?? '',
    });
  }
  closeDetail() { this.detailAppt.set(null); }

  // Field setters (arrow functions are not supported in Angular templates)
  setNotesTreatment(v: string)            { this.notesForm.update(f => ({ ...f, treatmentDone: v })); }
  setNotesText(v: string)                 { this.notesForm.update(f => ({ ...f, clinicNotes: v })); }
  setNotesAmount(v: string)               { this.notesForm.update(f => ({ ...f, amountCharged: v })); }
  setNotesPayStatus(v: PaymentStatus | '') { this.notesForm.update(f => ({ ...f, paymentStatus: v })); }
  setNotesPayMethod(v: PaymentMethod | '') { this.notesForm.update(f => ({ ...f, paymentMethod: v })); }

  cancelNotesEdit() {
    const appt = this.detailAppt();
    if (appt) {
      this.notesForm.set({
        clinicNotes:   appt.clinicNotes   ?? '',
        treatmentDone: appt.treatmentDone ?? '',
        amountCharged: appt.amountCharged != null ? String(appt.amountCharged) : '',
        paymentStatus: appt.paymentStatus ?? '',
        paymentMethod: appt.paymentMethod ?? '',
      });
    }
    this.editingNotes.set(false);
  }

  async saveNotes() {
    const appt = this.detailAppt();
    if (!appt?.id) return;
    this.savingNotes.set(true);
    try {
      const f = this.notesForm();
      const charged = f.amountCharged ? parseFloat(f.amountCharged) : undefined;
      const data: Partial<Appointment> = {
        clinicNotes:   f.clinicNotes   || undefined,
        treatmentDone: f.treatmentDone || undefined,
        amountCharged: charged && !isNaN(charged) ? charged : undefined,
        paymentStatus: f.paymentStatus || undefined,
        paymentMethod: f.paymentMethod || undefined,
      };
      await this.appointmentService.updateClinicalDetails(appt.id, data);
      const updated = { ...appt, ...data };
      this.appointments.update(list => list.map(a => a.id === appt.id ? updated : a));
      this.detailAppt.set(updated);
      this.editingNotes.set(false);
      this.setSuccess('Clinical record saved.');
    } catch {
      this.setError('Could not save notes.');
    } finally {
      this.savingNotes.set(false);
    }
  }

  // ── Search & filter helpers ──────────────────────────────────────────────
  clearFilters() {
    this.searchQuery.set('');
    this.dateFrom.set('');
    this.dateTo.set('');
  }

  setDateQuick(preset: 'today' | 'week' | 'month') {
    const d   = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const fmt = (date: Date) =>
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

    if (preset === 'today') {
      this.dateFrom.set(this.today);
      this.dateTo.set(this.today);
    } else if (preset === 'week') {
      const start = new Date(d);
      start.setDate(d.getDate() - d.getDay());
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      this.dateFrom.set(fmt(start));
      this.dateTo.set(fmt(end));
    } else {
      this.dateFrom.set(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`);
      this.dateTo.set(fmt(new Date(d.getFullYear(), d.getMonth() + 1, 0)));
    }
  }

  // ── Utilities ────────────────────────────────────────────────────────────
  async logout() {
    await this.auth.logout();
    this.router.navigate(['/business/login']);
  }

  private timeToMinutes(time: string): number {
    const value = (time || '').trim();
    if (/^\d{2}:\d{2}$/.test(value)) {
      const [hours, minutes] = value.split(':').map(Number);
      return (hours * 60) + minutes;
    }

    const match = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!match) return Number.MAX_SAFE_INTEGER;

    let hours = Number(match[1]);
    const minutes = Number(match[2]);
    const meridiem = match[3].toUpperCase();

    if (meridiem === 'PM' && hours !== 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;

    return (hours * 60) + minutes;
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  }

  isToday(dateStr: string): boolean { return dateStr === this.today; }

  whatsappUrl(appt: Appointment): string {
    const msg = `Hi ${appt.name}! Your appointment at ${this.clinicConfig.name} is confirmed for ${this.formatDate(appt.date)} at ${appt.time}. Booking Ref: ${appt.bookingRef}. Address: ${this.clinic.address}. See you soon! — ${this.clinicConfig.doctorName}`;
    return this.clinic.whatsappUrl(msg);
  }

  statusColor(status: string): string {
    const map: Record<string, string> = {
      confirmed:  'bg-green-100 text-green-700',
      checked_in: 'bg-blue-100 text-blue-700',
      completed:  'bg-indigo-100 text-indigo-700',
      no_show:    'bg-gray-100 text-gray-500',
      cancelled:  'bg-red-100 text-red-600',
      pending:    'bg-amber-100 text-amber-700',
    };
    return map[status] ?? 'bg-gray-100 text-gray-600';
  }

  statusLabel(status: string): string {
    const map: Record<string, string> = {
      checked_in: 'Arrived',
      no_show:    'No Show',
      pending:    'Pending',
      confirmed:  'Confirmed',
      completed:  'Completed',
      cancelled:  'Cancelled',
    };
    return map[status] ?? status;
  }

  paymentStatusColor(s: PaymentStatus): string {
    return s === 'paid'    ? 'bg-emerald-100 text-emerald-700'
         : s === 'unpaid'  ? 'bg-red-100 text-red-600'
         :                   'bg-amber-100 text-amber-700';
  }

  paymentStatusLabel(s: PaymentStatus): string {
    return s === 'paid' ? '₹ Paid' : s === 'unpaid' ? '₹ Unpaid' : '₹ Partial';
  }

  statusDot(status: string): string {
    const map: Record<string, string> = {
      confirmed:  'bg-green-500',
      checked_in: 'bg-blue-500',
      completed:  'bg-indigo-500',
      no_show:    'bg-gray-400',
      cancelled:  'bg-red-500',
      pending:    'bg-amber-400',
    };
    return map[status] ?? 'bg-gray-400';
  }

  exportCsv() {
    const rows = this.filteredAppointments();
    if (!rows.length) return;
    const headers = ['Booking Ref', 'Name', 'Phone', 'Email', 'Service', 'Date', 'Time', 'Status', 'Message'];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      headers.join(','),
      ...rows.map(a => [
        a.bookingRef, a.name, a.phone, a.email ?? '',
        a.service, a.date, a.time, a.status, a.message ?? '',
      ].map(esc).join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const el   = Object.assign(document.createElement('a'), {
      href: url, download: `appointments-${this.activeTab()}-${this.today}.csv`,
    });
    document.body.appendChild(el); el.click();
    document.body.removeChild(el); URL.revokeObjectURL(url);
  }
}
