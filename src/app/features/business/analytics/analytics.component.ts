import { Component, signal, computed, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ClinicFirestoreService, StoredClinic, AppointmentDoc } from '../../../core/services/clinic-firestore.service';

interface ClinicStats {
  clinic:    StoredClinic;
  thisMonth: number;
  allTime:   number;
}

interface ServiceCount {
  service: string;
  count:   number;
  pct:     number;
}

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './analytics.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalyticsComponent implements OnInit {
  private store = inject(ClinicFirestoreService);

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
}
