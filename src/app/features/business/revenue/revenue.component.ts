import { Component, signal, computed, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ClinicFirestoreService, StoredClinic } from '../../../core/services/clinic-firestore.service';
import { PLATFORM_PLANS } from '../../../core/config/clinic.config';

@Component({
  selector: 'app-revenue',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './revenue.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RevenueComponent implements OnInit {
  private clinicStore = inject(ClinicFirestoreService);

  clinics = signal<StoredClinic[]>([]);
  loading = signal(true);

  // ── Derived stats ─────────────────────────────────────────────────────────
  activeClinics  = computed(() => this.clinics().filter(c => c.subscriptionStatus === 'active'));
  trialClinics   = computed(() => this.clinics().filter(c => c.subscriptionStatus === 'trial'));
  expiredClinics = computed(() => this.clinics().filter(c =>
    c.subscriptionStatus === 'expired' || c.subscriptionStatus === 'cancelled'));

  mrr = computed(() =>
    this.activeClinics().reduce((sum, c) => {
      const plan  = c.subscriptionPlan ?? 'trial';
      const cycle = c.billingCycle ?? 'monthly';
      const rate  = cycle === 'yearly'
        ? Math.round(PLATFORM_PLANS[plan].yearly / 12)
        : PLATFORM_PLANS[plan].monthly;
      return sum + rate;
    }, 0)
  );

  arr = computed(() => this.mrr() * 12);

  // Clinics sorted: active first by renewal date, then trial by trial end
  sortedClinics = computed(() =>
    [...this.clinics()].sort((a, b) => {
      const dateA = a.subscriptionEndDate || a.trialEndDate || '9999';
      const dateB = b.subscriptionEndDate || b.trialEndDate || '9999';
      return dateA.localeCompare(dateB);
    })
  );

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  async ngOnInit() {
    try {
      this.clinics.set(await this.clinicStore.getAll());
    } finally {
      this.loading.set(false);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  planLabel(clinic: StoredClinic): string {
    const plan = clinic.subscriptionPlan ?? 'trial';
    return PLATFORM_PLANS[plan]?.label ?? '—';
  }

  statusClasses(clinic: StoredClinic): string {
    const s = clinic.subscriptionStatus ?? 'trial';
    if (s === 'active')    return 'bg-green-100 text-green-700';
    if (s === 'expired')   return 'bg-red-100 text-red-700';
    if (s === 'cancelled') return 'bg-gray-100 text-gray-500';
    return 'bg-yellow-100 text-yellow-700';
  }

  statusLabel(clinic: StoredClinic): string {
    const s = clinic.subscriptionStatus ?? 'trial';
    if (s === 'active')    return 'Active';
    if (s === 'expired')   return 'Expired';
    if (s === 'cancelled') return 'Cancelled';
    // trial — days left
    const end = clinic.trialEndDate ? new Date(clinic.trialEndDate) : null;
    const days = end ? Math.ceil((end.getTime() - Date.now()) / 86_400_000) : null;
    return days !== null ? (days > 0 ? `Trial · ${days}d left` : 'Trial · Ended') : 'Trial';
  }

  renewalDate(clinic: StoredClinic): string {
    const d = clinic.subscriptionEndDate || clinic.trialEndDate;
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  monthlyRate(clinic: StoredClinic): string {
    const plan  = clinic.subscriptionPlan ?? 'trial';
    const cycle = clinic.billingCycle ?? 'monthly';
    const rate  = cycle === 'yearly'
      ? PLATFORM_PLANS[plan].yearly
      : PLATFORM_PLANS[plan].monthly;
    if (!rate) return '—';
    return `₹${rate}${cycle === 'yearly' ? '/yr' : '/mo'}`;
  }

  whatsappReminder(clinic: StoredClinic): string {
    const plan     = this.planLabel(clinic);
    const renewal  = this.renewalDate(clinic);
    const amount   = this.monthlyRate(clinic);
    const msg = `Hi ${clinic.doctorName || clinic.name}! This is a reminder that your mydentalplatform ${plan} subscription (${amount}) is due for renewal on ${renewal}. Please make the payment to keep your clinic website active. Thank you!`;
    return `https://wa.me/${clinic.whatsappNumber}?text=${encodeURIComponent(msg)}`;
  }
}
