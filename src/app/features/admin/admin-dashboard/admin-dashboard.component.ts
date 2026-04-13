import {
  Component, signal, computed, ChangeDetectionStrategy,
  inject, OnInit, OnDestroy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { AppointmentService, Appointment } from '../../../core/services/appointment.service';
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

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [RouterLink, FormsModule],
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

  today = new Date().toISOString().split('T')[0];
  private errorTimer: ReturnType<typeof setTimeout> | null = null;
  private successTimer: ReturnType<typeof setTimeout> | null = null;

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
    const parts = this.clinicConfig.doctorName?.split(' ') ?? [];
    return parts[parts.length - 1] ?? this.clinicConfig.doctorName ?? 'Doctor';
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

  hasActiveFilters = computed(() =>
    this.searchQuery().trim().length > 0 || this.dateFrom() !== '' || this.dateTo() !== '',
  );

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

  // ── Lifecycle ────────────────────────────────────────────────────────────
  async ngOnInit() { await this.loadAppointments(); }

  ngOnDestroy() {
    if (this.errorTimer)   clearTimeout(this.errorTimer);
    if (this.successTimer) clearTimeout(this.successTimer);
  }

  async loadAppointments() {
    this.loading.set(true);
    try {
      this.appointments.set(await this.appointmentService.getAllAppointments());
    } catch {
      this.setError('Failed to load appointments.');
    } finally {
      this.loading.set(false);
    }
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
  openDetail(appt: Appointment) { this.detailAppt.set(appt); }
  closeDetail()                  { this.detailAppt.set(null); }

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
