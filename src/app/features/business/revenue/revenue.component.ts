import { Component, signal, computed, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ClinicFirestoreService, StoredClinic, AppointmentDoc } from '../../../core/services/clinic-firestore.service';
import { PLATFORM_PLANS } from '../../../core/config/clinic.config';

@Component({
  selector: 'app-revenue',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './revenue.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RevenueComponent implements OnInit {
  private clinicStore = inject(ClinicFirestoreService);

  clinics      = signal<StoredClinic[]>([]);
  appointments = signal<AppointmentDoc[]>([]);
  loading      = signal(true);

  costs        = signal({ vercel: 0, firebase: 0, domain: 0, other: 0 });
  editingCosts = signal(false);
  savingCosts  = signal(false);

  // ── Derived stats ─────────────────────────────────────────────────────────
  activeClinics  = computed(() => this.clinics().filter(c =>
    c.subscriptionStatus === 'active' && !this.isFree(c)));
  freeClinics    = computed(() => this.clinics().filter(c => this.isFree(c)));
  expiredClinics = computed(() => this.clinics().filter(c =>
    !this.isFree(c) &&
    (c.subscriptionStatus === 'expired' || c.subscriptionStatus === 'cancelled')));

  mrr = computed(() =>
    this.activeClinics().reduce((sum, c) => {
      const plan  = c.subscriptionPlan ?? 'trial';
      const cycle = c.billingCycle ?? 'monthly';
      const planData = PLATFORM_PLANS[plan];
      if (!planData) return sum;
      const rate  = cycle === 'yearly'
        ? Math.round(planData.yearly / 12)
        : planData.monthly;
      return sum + rate;
    }, 0)
  );

  arr = computed(() => this.mrr() * 12);

  totalCosts   = computed(() => Object.values(this.costs()).reduce((s, v) => s + (Number(v) || 0), 0));
  profit       = computed(() => this.mrr() - this.totalCosts());
  profitMargin = computed(() => this.mrr() > 0 ? Math.round((this.profit() / this.mrr()) * 100) : 0);

  // Paid subscriptions renewing within 7 days.
  expiringSoon = computed(() => {
    const in7 = new Date();
    in7.setDate(in7.getDate() + 7);
    const today = new Date();
    return this.clinics().filter(c => {
      if (this.isFree(c) || c.subscriptionStatus !== 'active') return false;
      const dateStr = c.subscriptionEndDate;
      if (!dateStr) return false;
      const d = new Date(dateStr);
      return d >= today && d <= in7;
    });
  });

  daysUntil(isoDate: string): number {
    return Math.ceil((new Date(isoDate).getTime() - Date.now()) / 86_400_000);
  }

  expiryDate(clinic: StoredClinic): string {
    return clinic.subscriptionEndDate ?? '';
  }

  // Paid renewals first; Free clinics without renewal dates sort last.
  sortedClinics = computed(() =>
    [...this.clinics()].sort((a, b) => {
      const dateA = this.isFree(a) ? '9999' : (a.subscriptionEndDate || '9999');
      const dateB = this.isFree(b) ? '9999' : (b.subscriptionEndDate || '9999');
      return dateA.localeCompare(dateB);
    })
  );

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  async ngOnInit() {
    try {
      const [clinics, costs, appointments] = await Promise.all([
        this.clinicStore.getAll(),
        this.clinicStore.getPlatformSettings(),
        this.clinicStore.getAllAppointments(),
      ]);
      this.clinics.set(clinics);
      this.costs.set(costs);
      this.appointments.set(appointments);
    } finally {
      this.loading.set(false);
    }
  }

  async saveCosts() {
    this.savingCosts.set(true);
    try {
      await this.clinicStore.savePlatformSettings(this.costs());
      this.editingCosts.set(false);
    } finally {
      this.savingCosts.set(false);
    }
  }

  getCost(key: string): number {
    return (this.costs() as Record<string, number>)[key] ?? 0;
  }

  updateCost(key: string, value: string) {
    this.costs.set({ ...this.costs(), [key]: Number(value) || 0 });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  planLabel(clinic: StoredClinic): string {
    const plan = clinic.subscriptionPlan ?? 'trial';
    return PLATFORM_PLANS[plan]?.label ?? '—';
  }

  isFree(clinic: StoredClinic): boolean {
    return (clinic.subscriptionPlan ?? 'trial') === 'trial';
  }

  statusClasses(clinic: StoredClinic): string {
    if (this.isFree(clinic)) return 'bg-blue-100 text-blue-700';
    const s = clinic.subscriptionStatus ?? 'trial';
    if (s === 'active')    return 'bg-green-100 text-green-700';
    if (s === 'expired')   return 'bg-red-100 text-red-700';
    if (s === 'cancelled') return 'bg-gray-100 text-gray-500';
    return 'bg-yellow-100 text-yellow-700';
  }

  statusLabel(clinic: StoredClinic): string {
    if (this.isFree(clinic)) return 'Free · No expiry';
    const s = clinic.subscriptionStatus ?? 'trial';
    if (s === 'active')    return 'Active';
    if (s === 'pending')   return 'Pending payment';
    if (s === 'expired')   return 'Expired';
    if (s === 'cancelled') return 'Cancelled';
    return 'Plan not set';
  }

  renewalDate(clinic: StoredClinic): string {
    if (this.isFree(clinic)) return 'No expiry';
    const d = clinic.subscriptionEndDate;
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  monthlyRate(clinic: StoredClinic): string {
    const plan     = clinic.subscriptionPlan ?? 'trial';
    const cycle    = clinic.billingCycle ?? 'monthly';
    const planData = PLATFORM_PLANS[plan];
    if (!planData) return '—';
    const rate = cycle === 'yearly' ? planData.yearly : planData.monthly;
    if (!rate) return '—';
    return `₹${rate}${cycle === 'yearly' ? '/yr' : '/mo'}`;
  }

  bookingsThisMonth(clinic: StoredClinic): number {
    const prefix = new Date().toISOString().slice(0, 7); // "YYYY-MM"
    return this.appointments().filter(a =>
      (a.clinicId === clinic.clinicId || a.clinicId === clinic.id) &&
      (a.date ?? '').startsWith(prefix)
    ).length;
  }

  whatsappReminder(clinic: StoredClinic): string {
    const plan     = this.planLabel(clinic);
    const renewal  = this.renewalDate(clinic);
    const amount   = this.monthlyRate(clinic);
    const msg = `Hi ${clinic.doctorName || clinic.name}! This is a reminder that your mydentalplatform ${plan} subscription (${amount}) is due for renewal on ${renewal}. Please make the payment to keep your clinic website active. Thank you!`;
    return `https://wa.me/${clinic.whatsappNumber}?text=${encodeURIComponent(msg)}`;
  }
}
