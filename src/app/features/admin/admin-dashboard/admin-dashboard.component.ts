import { Component, signal, computed, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { AppointmentService, Appointment } from '../../../core/services/appointment.service';
import { ClinicConfigService } from '../../../core/services/clinic-config.service';

const THEME_COLORS: Record<string, { hex: string; hexLight: string; textClass: string; bgClass: string }> = {
  blue:    { hex: '#2563eb', hexLight: '#dbeafe', textClass: 'text-blue-600',    bgClass: 'bg-blue-600'    },
  teal:    { hex: '#0d9488', hexLight: '#ccfbf1', textClass: 'text-teal-600',    bgClass: 'bg-teal-600'    },
  emerald: { hex: '#059669', hexLight: '#d1fae5', textClass: 'text-emerald-600', bgClass: 'bg-emerald-600' },
  purple:  { hex: '#7c3aed', hexLight: '#ede9fe', textClass: 'text-purple-600',  bgClass: 'bg-purple-600'  },
  rose:    { hex: '#e11d48', hexLight: '#ffe4e6', textClass: 'text-rose-600',    bgClass: 'bg-rose-600'    },
  caramel: { hex: '#b45309', hexLight: '#fef3c7', textClass: 'text-amber-700',   bgClass: 'bg-amber-700'   },
};

type FilterTab = 'all' | 'pending' | 'confirmed' | 'today' | 'checked_in' | 'completed';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './admin-dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDashboardComponent implements OnInit {
  private auth               = inject(AuthService);
  private appointmentService = inject(AppointmentService);
  private router             = inject(Router);
  readonly clinic            = inject(ClinicConfigService);
  readonly clinicConfig      = this.clinic.config;

  appointments    = signal<Appointment[]>([]);
  loading         = signal(true);
  activeTab       = signal<FilterTab>('all');
  actionError     = signal<string | null>(null);
  updatingId      = signal<string | null>(null);
  confirmCancelId = signal<string | null>(null);   // inline confirm instead of browser confirm()
  sidebarOpen     = signal(false);

  today = new Date().toISOString().split('T')[0];

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
    return new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  get doctorFirstName(): string {
    const parts = this.clinicConfig.doctorName?.split(' ') ?? [];
    return parts[parts.length - 1] ?? this.clinicConfig.doctorName ?? 'Doctor';
  }

  patientInitials(name: string): string {
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  filteredAppointments = computed(() => {
    const all = this.appointments();
    const tab = this.activeTab();
    if (tab === 'today')      return all.filter(a => a.date === this.today);
    if (tab === 'pending')    return all.filter(a => a.status === 'pending');
    if (tab === 'confirmed')  return all.filter(a => a.status === 'confirmed');
    if (tab === 'checked_in') return all.filter(a => a.status === 'checked_in');
    if (tab === 'completed')  return all.filter(a => a.status === 'completed');
    return all;
  });

  counts = computed(() => ({
    all:        this.appointments().length,
    today:      this.appointments().filter(a => a.date === this.today).length,
    pending:    this.appointments().filter(a => a.status === 'pending').length,
    confirmed:  this.appointments().filter(a => a.status === 'confirmed').length,
    checked_in: this.appointments().filter(a => a.status === 'checked_in').length,
    completed:  this.appointments().filter(a => a.status === 'completed').length,
  }));

  // ── Subscription helpers ──────────────────────────────────────────────────
  get plan()   { return this.clinicConfig.subscriptionPlan   ?? 'trial'; }
  get status() { return this.clinicConfig.subscriptionStatus ?? 'trial'; }

  get trialDaysLeft(): number {
    if (!this.clinicConfig.trialEndDate) return 30;
    const end  = new Date(this.clinicConfig.trialEndDate).getTime();
    const now  = Date.now();
    return Math.max(0, Math.ceil((end - now) / 86_400_000));
  }

  get isExpired()     { return this.status === 'expired'   || (this.status === 'trial' && this.trialDaysLeft <= 0); }
  get isTrialUrgent() { return this.status === 'trial'     && this.trialDaysLeft > 0 && this.trialDaysLeft <= 7; }
  get isTrial()       { return this.status === 'trial'     && this.trialDaysLeft > 0; }
  get isStarter()     { return this.plan   === 'starter'   && this.status === 'active'; }
  get isPro()         { return this.plan   === 'pro'        && this.status === 'active'; }
  get showUpgradeBanner() { return !this.isPro; }

  async ngOnInit() {
    await this.loadAppointments();
  }

  async loadAppointments() {
    this.loading.set(true);
    try {
      const list = await this.appointmentService.getAllAppointments();
      this.appointments.set(list);
    } catch (e) {
      console.error('[Admin] Failed to load appointments:', e);
      this.actionError.set('Failed to load appointments.');
    } finally {
      this.loading.set(false);
    }
  }

  async confirm(appt: Appointment) {
    this.updatingId.set(appt.id!);
    this.actionError.set(null);
    try {
      await this.appointmentService.setStatus(appt.id!, 'confirmed');
      this.appointments.update(list =>
        list.map(a => a.id === appt.id ? { ...a, status: 'confirmed' } : a)
      );
    } catch (e) {
      console.error('[Admin] Could not confirm appointment:', e);
      this.actionError.set('Could not confirm appointment.');
    } finally {
      this.updatingId.set(null);
    }
  }

  requestCancel(appt: Appointment) {
    this.confirmCancelId.set(appt.id!);
  }

  dismissCancel() {
    this.confirmCancelId.set(null);
  }

  async cancel(appt: Appointment) {
    this.confirmCancelId.set(null);
    this.updatingId.set(appt.id!);
    this.actionError.set(null);
    try {
      await this.appointmentService.setStatus(appt.id!, 'cancelled');
      this.appointments.update(list =>
        list.map(a => a.id === appt.id ? { ...a, status: 'cancelled' } : a)
      );
    } catch (e) {
      console.error('[Admin] Could not cancel appointment:', e);
      this.actionError.set('Could not cancel appointment.');
    } finally {
      this.updatingId.set(null);
    }
  }

  async markArrived(appt: Appointment) {
    this.updatingId.set(appt.id!);
    this.actionError.set(null);
    try {
      await this.appointmentService.setStatus(appt.id!, 'checked_in');
      this.appointments.update(list =>
        list.map(a => a.id === appt.id ? { ...a, status: 'checked_in' } : a)
      );
    } catch (e) {
      this.actionError.set('Could not update status.');
    } finally {
      this.updatingId.set(null);
    }
  }

  async markCompleted(appt: Appointment) {
    this.updatingId.set(appt.id!);
    this.actionError.set(null);
    try {
      await this.appointmentService.setStatus(appt.id!, 'completed');
      this.appointments.update(list =>
        list.map(a => a.id === appt.id ? { ...a, status: 'completed' } : a)
      );
    } catch (e) {
      this.actionError.set('Could not update status.');
    } finally {
      this.updatingId.set(null);
    }
  }

  async markNoShow(appt: Appointment) {
    this.updatingId.set(appt.id!);
    this.actionError.set(null);
    try {
      await this.appointmentService.setStatus(appt.id!, 'no_show');
      this.appointments.update(list =>
        list.map(a => a.id === appt.id ? { ...a, status: 'no_show' } : a)
      );
    } catch (e) {
      this.actionError.set('Could not update status.');
    } finally {
      this.updatingId.set(null);
    }
  }

  async logout() {
    await this.auth.logout();
    this.router.navigate(['/admin/login']);
  }

  formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  whatsappUrl(appt: Appointment): string {
    const msg = `Hi ${appt.name}! Your appointment at ${this.clinicConfig.name} is confirmed for ${this.formatDate(appt.date)} (${appt.time}). Your Booking Ref: ${appt.bookingRef}. Address: ${this.clinic.address}. See you soon! — ${this.clinicConfig.doctorName}`;
    return this.clinic.whatsappUrl(msg);
  }

  statusColor(status: string): string {
    if (status === 'confirmed')  return 'bg-green-100 text-green-700';
    if (status === 'checked_in') return 'bg-blue-100 text-blue-700';
    if (status === 'completed')  return 'bg-indigo-100 text-indigo-700';
    if (status === 'no_show')    return 'bg-gray-100 text-gray-500';
    if (status === 'cancelled')  return 'bg-red-100 text-red-600';
    return 'bg-yellow-100 text-yellow-700';  // pending
  }

  exportCsv() {
    const rows = this.filteredAppointments();
    if (!rows.length) return;

    const headers = ['Booking Ref', 'Name', 'Phone', 'Email', 'Service', 'Date', 'Time', 'Status', 'Message'];
    const escape  = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines   = [
      headers.join(','),
      ...rows.map(a => [
        a.bookingRef, a.name, a.phone, a.email ?? '',
        a.service, a.date, a.time, a.status, a.message ?? '',
      ].map(escape).join(',')),
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href: url,
      download: `appointments-${this.activeTab()}-${this.today}.csv`,
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  statusLabel(status: string): string {
    if (status === 'checked_in') return 'Arrived';
    if (status === 'no_show')    return 'No Show';
    return status.charAt(0).toUpperCase() + status.slice(1);
  }
}
