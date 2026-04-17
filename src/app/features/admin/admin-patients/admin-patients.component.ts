import { Component, signal, computed, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { AppointmentService, Appointment } from '../../../core/services/appointment.service';
import { ClinicConfigService } from '../../../core/services/clinic-config.service';

export interface PatientSummary {
  phone:             string;
  name:              string;         // latest name used
  email?:            string;
  appointments:      Appointment[];
  totalVisits:       number;         // completed + checked_in
  lastVisitDate?:    string;         // most recent completed/checked_in date
  nextAppointment?:  Appointment;    // soonest upcoming (pending/confirmed)
  totalCharged:      number;
  totalPaid:         number;
  pendingBalance:    number;
  firstSeen:         string;         // earliest appointment date
}

const THEME_COLORS: Record<string, { hex: string; hexLight: string; textClass: string }> = {
  blue:    { hex: '#1E56DC', hexLight: '#EBF2FF', textClass: 'text-blue-700'    },
  teal:    { hex: '#0B7285', hexLight: '#ECFEFF', textClass: 'text-cyan-700'    },
  emerald: { hex: '#047857', hexLight: '#ECFDF5', textClass: 'text-emerald-700' },
  purple:  { hex: '#4338CA', hexLight: '#EEF2FF', textClass: 'text-indigo-700'  },
  rose:    { hex: '#BE123C', hexLight: '#FFF1F2', textClass: 'text-rose-700'    },
  caramel: { hex: '#B45309', hexLight: '#FFFBEB', textClass: 'text-amber-700'   },
};

@Component({
  selector: 'app-admin-patients',
  standalone: true,
  imports: [RouterLink, FormsModule, DecimalPipe],
  templateUrl: './admin-patients.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPatientsComponent implements OnInit {
  private apptService  = inject(AppointmentService);
  readonly clinic      = inject(ClinicConfigService);
  readonly clinicConfig = this.clinic.config;

  loading        = signal(true);
  error          = signal<string | null>(null);
  allAppts       = signal<Appointment[]>([]);
  search         = signal('');
  selectedPatient = signal<PatientSummary | null>(null);
  sidebarOpen    = signal(false);

  get themeColor() {
    return THEME_COLORS[this.clinicConfig.theme ?? 'blue'] ?? THEME_COLORS['blue'];
  }

  // ── Derived: group appointments into patient records ──────────────────────
  patients = computed<PatientSummary[]>(() => {
    const appts = this.allAppts();
    const map = new Map<string, Appointment[]>();

    for (const a of appts) {
      const key = a.phone;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }

    const today = new Date().toISOString().split('T')[0];
    const records: PatientSummary[] = [];

    for (const [phone, group] of map.entries()) {
      // Sort by date desc
      const sorted = [...group].sort((a, b) => b.date.localeCompare(a.date));

      // Most recent name/email
      const name  = sorted[0].name;
      const email = sorted.find(a => a.email)?.email;

      // Visit counts (completed + checked_in)
      const visited = group.filter(a => a.status === 'completed' || a.status === 'checked_in');
      const totalVisits = visited.length;

      // Last visit (most recent completed/checked_in)
      const lastVisitDate = visited.length > 0
        ? [...visited].sort((a, b) => b.date.localeCompare(a.date))[0].date
        : undefined;

      // Next upcoming appointment (pending/confirmed, date >= today)
      const upcoming = group
        .filter(a => (a.status === 'pending' || a.status === 'confirmed') && a.date >= today)
        .sort((a, b) => a.date.localeCompare(b.date));
      const nextAppointment = upcoming[0] ?? undefined;

      // Financials
      const totalCharged = group.reduce((s, a) => s + (a.amountCharged ?? 0), 0);
      const totalPaid    = group
        .filter(a => a.paymentStatus === 'paid')
        .reduce((s, a) => s + (a.amountCharged ?? 0), 0);

      // First seen
      const firstSeen = [...group].sort((a, b) => a.date.localeCompare(b.date))[0].date;

      records.push({
        phone, name, email,
        appointments: sorted,
        totalVisits,
        lastVisitDate,
        nextAppointment,
        totalCharged,
        totalPaid,
        pendingBalance: totalCharged - totalPaid,
        firstSeen,
      });
    }

    // Sort: patients with upcoming appointments first, then by last visit desc
    return records.sort((a, b) => {
      if (a.nextAppointment && !b.nextAppointment) return -1;
      if (!a.nextAppointment && b.nextAppointment) return  1;
      const aDate = a.lastVisitDate ?? a.firstSeen;
      const bDate = b.lastVisitDate ?? b.firstSeen;
      return bDate.localeCompare(aDate);
    });
  });

  filteredPatients = computed(() => {
    const q = this.search().trim().toLowerCase();
    if (!q) return this.patients();
    return this.patients().filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.phone.includes(q) ||
      (p.email?.toLowerCase().includes(q) ?? false)
    );
  });

  summaryStats = computed(() => {
    const all = this.patients();
    const today = new Date().toISOString().split('T')[0];
    const thisMonth = today.slice(0, 7);
    return {
      total:       all.length,
      withBalance: all.filter(p => p.pendingBalance > 0).length,
      newThisMonth: this.allAppts().filter(a => a.date.startsWith(thisMonth) && a.status === 'completed').length,
      totalRevenue: all.reduce((s, p) => s + p.totalPaid, 0),
    };
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  async ngOnInit() {
    try {
      this.allAppts.set(await this.apptService.getAllAppointments());
    } catch {
      this.error.set('Failed to load patients.');
    } finally {
      this.loading.set(false);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  selectPatient(p: PatientSummary) { this.selectedPatient.set(p); }
  closePanel()                      { this.selectedPatient.set(null); }

  initials(name: string): string {
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  formatDate(d: string): string {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  }

  formatDateShort(d: string): string {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short',
    });
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
      checked_in: 'Arrived', no_show: 'No Show', pending: 'Pending',
      confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled',
    };
    return map[status] ?? status;
  }

  paymentColor(s: string): string {
    return s === 'paid'   ? 'bg-emerald-100 text-emerald-700'
         : s === 'unpaid' ? 'bg-red-100 text-red-600'
         :                  'bg-amber-100 text-amber-700';
  }

  whatsappUrl(p: PatientSummary): string {
    const msg = `Hi ${p.name}! This is ${this.clinicConfig.name}. Just a quick message from our clinic. Looking forward to seeing you again!`;
    return `https://wa.me/${p.phone}?text=${encodeURIComponent(msg)}`;
  }
}
