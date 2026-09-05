import { Component, signal, computed, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { ClinicApiService, StoredClinic, AppointmentDoc } from '../../../core/services/clinic-api.service';

interface ClinicStats {
  clinic:    StoredClinic;
  thisMonth: number;
  allTime:   number;
  marketplaceRequests: number;
  missedSlaRate: number | null;
}

interface ServiceCount {
  service: string;
  count:   number;
  pct:     number;
}

function timestampMillis(value?: string | { toMillis(): number }): number | null {
  if (!value) return null;
  const millis = typeof value === 'string' ? Date.parse(value) : value.toMillis();
  return Number.isFinite(millis) ? millis : null;
}

function responseMinutes(appointment: AppointmentDoc): number | null {
  const createdAt = timestampMillis(appointment.createdAt);
  const respondedAt = timestampMillis(appointment.confirmationRespondedAt);
  return createdAt == null || respondedAt == null
    ? null
    : Math.max(0, Math.round((respondedAt - createdAt) / 60_000));
}

function missedMarketplaceSla(appointment: AppointmentDoc): boolean | null {
  if (appointment.status === 'expired') return true;
  const deadline = timestampMillis(appointment.confirmationDeadline);
  const respondedAt = timestampMillis(appointment.confirmationRespondedAt);
  return deadline == null || respondedAt == null ? null : respondedAt > deadline;
}

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [],
  templateUrl: './analytics.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalyticsComponent implements OnInit {
  private store = inject(ClinicApiService);

  clinics      = signal<StoredClinic[]>([]);
  appointments = signal<AppointmentDoc[]>([]);
  loading      = signal(true);

  // ── Computed ──────────────────────────────────────────────────────────────
  private thisMonthPrefix = computed(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  thisMonthAppts = computed(() =>
    this.appointments().filter(a => (a.date ?? '').startsWith(this.thisMonthPrefix()))
  );

  totalThisMonth = computed(() => this.thisMonthAppts().length);
  totalAllTime   = computed(() => this.appointments().length);

  // Per-clinic stats sorted by this-month bookings desc
  clinicStats = computed((): ClinicStats[] => {
    const appts = this.appointments();
    const monthAppts = this.thisMonthAppts();
    return this.clinics()
      .map(clinic => ({
        clinic,
        thisMonth: monthAppts.filter(a => a.clinicId === clinic.clinicId || a.clinicId === clinic.id).length,
        allTime:   appts.filter(a => a.clinicId === clinic.clinicId || a.clinicId === clinic.id).length,
        ...this.marketplaceClinicStats(clinic, appts),
      }))
      .sort((a, b) => b.thisMonth - a.thisMonth);
  });

  maxThisMonth = computed(() =>
    Math.max(1, ...this.clinicStats().map(s => s.thisMonth))
  );

  // Top services this month
  topServices = computed((): ServiceCount[] => {
    const counts: Record<string, number> = {};
    for (const a of this.thisMonthAppts()) {
      const svc = a.service || 'General';
      counts[svc] = (counts[svc] ?? 0) + 1;
    }
    const total = this.totalThisMonth() || 1;
    return Object.entries(counts)
      .map(([service, count]) => ({ service, count, pct: Math.round((count / total) * 100) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  });

  maxServiceCount = computed(() =>
    Math.max(1, ...this.topServices().map(s => s.count))
  );

  // Peak booking day of week
  peakDay = computed(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const counts = new Array(7).fill(0);
    for (const a of this.appointments()) {
      if (a.date) counts[new Date(a.date).getDay()]++;
    }
    const max = Math.max(...counts);
    return max > 0 ? days[counts.indexOf(max)] : '—';
  });

  // Status breakdown this month
  statusCounts = computed(() => {
    const appts = this.thisMonthAppts();
    return {
      pending:   appts.filter(a => a.status === 'pending').length,
      confirmed: appts.filter(a => a.status === 'confirmed').length,
      cancelled: appts.filter(a => a.status === 'cancelled').length,
      declined:  appts.filter(a => a.status === 'declined').length,
      expired:   appts.filter(a => a.status === 'expired').length,
    };
  });

  marketplaceReliability = computed(() => {
    const requests = this.appointments().filter(appointment => appointment.source === 'marketplace');
    const confirmed = requests.filter(appointment => appointment.confirmedAt != null).length;
    const measured = requests
      .map(missedMarketplaceSla)
      .filter((value): value is boolean => value !== null);
    const responseTimes = requests
      .map(responseMinutes)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

    return {
      requests: requests.length,
      confirmationRate: requests.length ? Math.round((confirmed / requests.length) * 100) : null,
      averageResponseMinutes: responseTimes.length
        ? Math.round(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length)
        : null,
      missedSlaRate: measured.length
        ? Math.round((measured.filter(Boolean).length / measured.length) * 100)
        : null,
    };
  });

  // 10 most recent bookings across all clinics
  recentBookings = computed(() => this.appointments().slice(0, 10));

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  async ngOnInit() {
    try {
      const [clinics, appointments] = await Promise.all([
        this.store.getAll(),
        this.store.getAllAppointments(),
      ]);
      this.clinics.set(clinics);
      this.appointments.set(appointments);
    } finally {
      this.loading.set(false);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  clinicName(clinicId: string): string {
    const c = this.clinics().find(c => c.clinicId === clinicId || c.id === clinicId);
    return c?.name ?? clinicId;
  }

  formatDate(isoDate: string): string {
    if (!isoDate) return '—';
    return new Date(isoDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  barWidth(value: number, max: number): string {
    return `${Math.round((value / max) * 100)}%`;
  }

  currentMonth(): string {
    return new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }

  private marketplaceClinicStats(clinic: StoredClinic, appointments: AppointmentDoc[]) {
    const requests = appointments.filter(appointment =>
      appointment.source === 'marketplace' &&
      (appointment.clinicId === clinic.clinicId || appointment.clinicId === clinic.id),
    );
    const measured = requests
      .map(missedMarketplaceSla)
      .filter((value): value is boolean => value !== null);
    return {
      marketplaceRequests: requests.length,
      missedSlaRate: measured.length
        ? Math.round((measured.filter(Boolean).length / measured.length) * 100)
        : null,
    };
  }
}
