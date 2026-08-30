import {
  Component, signal, computed, ChangeDetectionStrategy, inject, OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ClinicFirestoreService, StoredClinic } from '../../../core/services/clinic-firestore.service';
import { BillingService, BillingPlan, BillingCycle } from '../../../core/services/billing.service';
import { PLATFORM_PLANS } from '../../../core/config/clinic.config';
import { AuthenticatedApiService } from '../../../core/services/authenticated-api.service';

interface Toast { msg: string; type: 'success' | 'error' }
type ClinicStatusFilter = 'all' | 'live' | 'inactive' | 'attention';
type ClinicSort = 'attention' | 'name' | 'subscription';

@Component({
  selector: 'app-clinic-list',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './clinic-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClinicListComponent implements OnInit {
  private clinicStore = inject(ClinicFirestoreService);
  private billing     = inject(BillingService);
  private api         = inject(AuthenticatedApiService);
  private router      = inject(Router);

  clinics          = signal<StoredClinic[]>([]);
  loading          = signal(true);
  error            = signal<string | null>(null);
  deleting         = signal<string | null>(null);
  toggling         = signal<string | null>(null);
  confirmDelete    = signal<string | null>(null);   // id awaiting inline confirm
  search           = signal('');
  statusFilter     = signal<ClinicStatusFilter>('all');
  sortBy           = signal<ClinicSort>('attention');
  expandedClinicId = signal<string | null>(null);
  toast            = signal<Toast | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Billing ───────────────────────────────────────────────────────────────
  billingClinicId  = signal<string | null>(null);   // which card is showing plan picker
  billingPlan      = signal<BillingPlan>('starter'); // selected plan in picker
  billingCycle     = signal<BillingCycle>('monthly');
  sendingPayment   = signal<string | null>(null);    // id being processed

  // ── Voice Agent ───────────────────────────────────────────────────────────
  creatingVoiceAgent = signal<string | null>(null);  // id being processed

  // ── Coming Soon ───────────────────────────────────────────────────────────
  togglingComingSoon = signal<string | null>(null);

  // ── Derived ───────────────────────────────────────────────────────────────
  filteredClinics = computed(() => {
    const q = this.search().toLowerCase().trim();
    const status = this.statusFilter();
    const sort = this.sortBy();

    return this.clinics()
      .filter(clinic => {
        const matchesQuery = !q || [
          clinic.name,
          clinic.doctorName,
          clinic.city,
          clinic.domain,
          clinic.vercelDomain,
        ].some(value => value?.toLowerCase().includes(q));

        if (!matchesQuery) return false;
        if (status === 'live') return clinic.active && !clinic.comingSoon;
        if (status === 'inactive') return !clinic.active || clinic.comingSoon;
        if (status === 'attention') return this.clinicNeedsAttention(clinic);
        return true;
      })
      .sort((first, second) => {
        if (sort === 'name') return first.name.localeCompare(second.name);
        if (sort === 'subscription') {
          return this.subscriptionPriority(first) - this.subscriptionPriority(second)
            || first.name.localeCompare(second.name);
        }
        return this.clinicReadiness(first).percentage - this.clinicReadiness(second).percentage
          || first.name.localeCompare(second.name);
      });
  });

  totalCount    = computed(() => this.clinics().length);
  activeCount   = computed(() => this.clinics().filter(c => c.active && !c.comingSoon).length);
  inactiveCount = computed(() => this.clinics().filter(c => !c.active || c.comingSoon).length);
  attentionCount = computed(() => this.clinics().filter(clinic => this.clinicNeedsAttention(clinic)).length);

  clinicReadiness(clinic: StoredClinic): { percentage: number; missing: string[] } {
    const checks = [
      { label: 'doctor profile', complete: Boolean(clinic.doctorName?.trim()) },
      { label: 'phone number', complete: Boolean(clinic.phone?.trim()) },
      { label: 'clinic address', complete: Boolean(clinic.addressLine1?.trim() && clinic.city?.trim()) },
      { label: 'website domain', complete: Boolean(clinic.domain?.trim() || clinic.vercelDomain?.trim()) },
      { label: 'services', complete: Boolean(clinic.services?.length) },
      { label: 'business hours', complete: Boolean(clinic.hours?.length) },
      { label: 'booking reference', complete: Boolean(clinic.bookingRefPrefix?.trim()) },
    ];
    const complete = checks.filter(check => check.complete).length;
    return {
      percentage: Math.round((complete / checks.length) * 100),
      missing: checks.filter(check => !check.complete).map(check => check.label),
    };
  }

  clinicNeedsAttention(clinic: StoredClinic): boolean {
    const subscriptionStatus = clinic.subscriptionStatus ?? 'trial';
    return this.clinicReadiness(clinic).percentage < 100
      || subscriptionStatus === 'expired'
      || subscriptionStatus === 'cancelled'
      || subscriptionStatus === 'pending';
  }

  clearFilters(): void {
    this.search.set('');
    this.statusFilter.set('all');
    this.sortBy.set('attention');
  }

  toggleOperations(clinicId: string): void {
    const nextClinicId = this.expandedClinicId() === clinicId ? null : clinicId;
    this.expandedClinicId.set(nextClinicId);
    this.billingClinicId.set(null);
    this.confirmDelete.set(null);
  }

  private subscriptionPriority(clinic: StoredClinic): number {
    const priorities: Record<string, number> = {
      expired: 0,
      cancelled: 1,
      pending: 2,
      trial: 3,
      active: 4,
    };
    return priorities[clinic.subscriptionStatus ?? 'trial'] ?? 5;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.clinics.set(await this.clinicStore.getAll());
    } catch {
      this.error.set('Failed to load clinics. Please refresh.');
    } finally {
      this.loading.set(false);
    }
  }

  // ── Delete (inline confirm) ───────────────────────────────────────────────
  requestDelete(id: string) {
    this.expandedClinicId.set(id);
    this.confirmDelete.set(id);
    this.billingClinicId.set(null);
  }

  cancelDelete() {
    this.confirmDelete.set(null);
  }

  async confirmRemove(clinic: StoredClinic) {
    this.confirmDelete.set(null);
    this.deleting.set(clinic.id);
    try {
      await this.clinicStore.remove(clinic.id);
      this.clinics.update(list => list.filter(c => c.id !== clinic.id));
      this.expandedClinicId.set(null);
      this.showToast(`"${clinic.name}" deleted.`, 'success');
    } catch {
      this.showToast('Failed to delete. Please try again.', 'error');
    } finally {
      this.deleting.set(null);
    }
  }

  // ── Quick active toggle ───────────────────────────────────────────────────
  async toggleActive(clinic: StoredClinic) {
    this.toggling.set(clinic.id);
    try {
      const newActive = !clinic.active;
      await this.clinicStore.update(clinic.id, { active: newActive });
      this.clinics.update(list =>
        list.map(c => c.id === clinic.id ? { ...c, active: newActive } : c)
      );
      this.showToast(`"${clinic.name}" ${newActive ? 'activated' : 'deactivated'}.`, 'success');
    } catch {
      this.showToast('Failed to update status.', 'error');
    } finally {
      this.toggling.set(null);
    }
  }

  // ── Subscription badge ────────────────────────────────────────────────────
  subscriptionBadge(clinic: StoredClinic): { label: string; classes: string } {
    const status = clinic.subscriptionStatus ?? 'trial';
    const plan   = clinic.subscriptionPlan   ?? 'trial';
    const planLabel = PLATFORM_PLANS[plan]?.label ?? 'Trial';

    if (status === 'active') {
      return { label: `${planLabel} · Active`, classes: 'ui-badge ui-badge-success' };
    }
    if (status === 'pending') {
      return { label: `${planLabel} · Pending`, classes: 'ui-badge ui-badge-warning' };
    }
    if (status === 'expired') {
      return { label: 'Expired', classes: 'ui-badge ui-badge-danger' };
    }
    if (status === 'cancelled') {
      return { label: 'Cancelled', classes: 'ui-badge' };
    }
    // trial — show days left
    const endDate  = clinic.trialEndDate ? new Date(clinic.trialEndDate) : null;
    const daysLeft = endDate
      ? Math.ceil((endDate.getTime() - Date.now()) / 86_400_000)
      : null;
    const dayStr = daysLeft !== null
      ? (daysLeft > 0 ? ` · ${daysLeft}d left` : ' · Ended')
      : '';
    return { label: `Trial${dayStr}`, classes: 'ui-badge ui-badge-warning' };
  }

  // ── Billing ───────────────────────────────────────────────────────────────
  openBilling(clinicId: string) {
    this.expandedClinicId.set(clinicId);
    this.billingClinicId.set(clinicId);
    this.confirmDelete.set(null);
    this.billingPlan.set('starter');
    this.billingCycle.set('monthly');
  }

  closeBilling() {
    this.billingClinicId.set(null);
  }

  billingPlanPrice(plan: BillingPlan): string {
    const amount = this.billing.planAmount(plan, this.billingCycle());
    const suffix = this.billingCycle() === 'yearly' ? '/year' : '/month';
    return `₹${amount.toLocaleString('en-IN')}${suffix}`;
  }

  async sendPaymentLink(clinic: StoredClinic) {
    this.sendingPayment.set(clinic.id);
    try {
      const phone = clinic.whatsappNumber || clinic.phone?.replace(/\D/g, '');
      const result = await this.billing.createSubscription(
        clinic.id,
        this.billingPlan(),
        this.billingCycle(),
        clinic.name,
        phone,
      );

      // Store subscription ID in Firestore so we can track it
      if (result.subscriptionId) {
        await this.clinicStore.update(clinic.id, {
          razorpaySubscriptionId: result.subscriptionId,
        } as Parameters<typeof this.clinicStore.update>[1]);
      }

      // Open WhatsApp with payment link — clinic owner clicks once, Razorpay does the rest
      const waUrl = this.billing.whatsappPaymentMessage(
        clinic.name,
        this.billingPlan(),
        this.billingCycle(),
        result.paymentUrl,
        result.paymentMode,
      );
      window.open(waUrl, '_blank');

      this.billingClinicId.set(null);
      this.showToast('Payment link sent via WhatsApp!', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create payment link.';
      this.showToast(msg, 'error');
    } finally {
      this.sendingPayment.set(null);
    }
  }

  // ── OpenAI Voice Receptionist ────────────────────────────────────────────
  async enableVoiceAgent(clinic: StoredClinic) {
    this.creatingVoiceAgent.set(clinic.id);
    try {
      const res = await this.api.fetch('/api/openai-voice?action=enable', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId: clinic.id }),
      });
      const data = await res.json() as { voice?: string; error?: string };
      if (!res.ok) throw new Error(data.error || 'OpenAI voice could not be enabled.');
      this.clinics.update(list =>
        list.map(c => c.id === clinic.id ? {
          ...c,
          voiceAgentEnabled: true,
          voiceProvider: 'openai',
          voiceAgentVoiceId: data.voice ?? 'marin',
        } : c)
      );
      this.showToast('OpenAI voice enabled. The receptionist is live on the clinic site.', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not enable OpenAI voice.';
      this.showToast(message, 'error');
    } finally {
      this.creatingVoiceAgent.set(null);
    }
  }

  // ── Coming Soon toggle ────────────────────────────────────────────────────
  async toggleComingSoon(clinic: StoredClinic) {
    this.togglingComingSoon.set(clinic.id);
    try {
      const next = !clinic.comingSoon;
      await this.clinicStore.update(clinic.id, { comingSoon: next } as Parameters<typeof this.clinicStore.update>[1]);
      this.clinics.update(list =>
        list.map(c => c.id === clinic.id ? { ...c, comingSoon: next } : c)
      );
      this.showToast(`"${clinic.name}" ${next ? 'set to Coming Soon' : 'restored to live site'}.`, 'success');
    } catch {
      this.showToast('Failed to update coming soon status.', 'error');
    } finally {
      this.togglingComingSoon.set(null);
    }
  }

  // ── Navigate ──────────────────────────────────────────────────────────────
  edit(id: string) {
    void this.router.navigate(['/business/clinics', id, 'edit']);
  }

  // ── Toast ─────────────────────────────────────────────────────────────────
  private showToast(msg: string, type: Toast['type']) {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast.set({ msg, type });
    this.toastTimer = setTimeout(() => this.toast.set(null), 3500);
  }
}
