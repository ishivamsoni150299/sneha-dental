import {
  Component, signal, computed, ChangeDetectionStrategy, inject, OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ClinicFirestoreService, StoredClinic } from '../../../core/services/clinic-firestore.service';
import { BillingService, BillingPlan } from '../../../core/services/billing.service';
import { PLATFORM_PLANS } from '../../../core/config/clinic.config';

interface Toast { msg: string; type: 'success' | 'error' }

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
  private router      = inject(Router);

  clinics          = signal<StoredClinic[]>([]);
  loading          = signal(true);
  error            = signal<string | null>(null);
  deleting         = signal<string | null>(null);
  toggling         = signal<string | null>(null);
  confirmDelete    = signal<string | null>(null);   // id awaiting inline confirm
  search           = signal('');
  toast            = signal<Toast | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Billing ───────────────────────────────────────────────────────────────
  billingClinicId  = signal<string | null>(null);   // which card is showing plan picker
  billingPlan      = signal<BillingPlan>('starter'); // selected plan in picker
  sendingPayment   = signal<string | null>(null);    // id being processed

  // ── Voice Agent ───────────────────────────────────────────────────────────
  creatingVoiceAgent = signal<string | null>(null);  // id being processed

  // ── Coming Soon ───────────────────────────────────────────────────────────
  togglingComingSoon = signal<string | null>(null);

  readonly themeColors: Record<string, string> = {
    blue:    '#2563eb',
    teal:    '#0d9488',
    emerald: '#059669',
    purple:  '#0f4c81',
    rose:    '#0891b2',
    caramel: '#b45309',
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  filteredClinics = computed(() => {
    const q = this.search().toLowerCase().trim();
    if (!q) return this.clinics();
    return this.clinics().filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.city?.toLowerCase().includes(q) ||
      c.domain?.toLowerCase().includes(q)
    );
  });

  totalCount    = computed(() => this.clinics().length);
  activeCount   = computed(() => this.clinics().filter(c => c.active).length);
  inactiveCount = computed(() => this.clinics().filter(c => !c.active).length);

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
    this.confirmDelete.set(id);
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
      return { label: `${planLabel} · Active`, classes: 'bg-green-100 text-green-700' };
    }
    if (status === 'expired') {
      return { label: 'Expired', classes: 'bg-red-100 text-red-700' };
    }
    if (status === 'cancelled') {
      return { label: 'Cancelled', classes: 'bg-gray-100 text-gray-500' };
    }
    // trial — show days left
    const endDate  = clinic.trialEndDate ? new Date(clinic.trialEndDate) : null;
    const daysLeft = endDate
      ? Math.ceil((endDate.getTime() - Date.now()) / 86_400_000)
      : null;
    const dayStr = daysLeft !== null
      ? (daysLeft > 0 ? ` · ${daysLeft}d left` : ' · Ended')
      : '';
    return { label: `Trial${dayStr}`, classes: 'bg-yellow-100 text-yellow-700' };
  }

  // ── Billing ───────────────────────────────────────────────────────────────
  openBilling(clinicId: string) {
    this.billingClinicId.set(clinicId);
    this.billingPlan.set('starter');
  }

  closeBilling() {
    this.billingClinicId.set(null);
  }

  async sendPaymentLink(clinic: StoredClinic) {
    this.sendingPayment.set(clinic.id);
    try {
      const phone = clinic.whatsappNumber || clinic.phone?.replace(/\D/g, '');
      const result = await this.billing.createSubscription(
        clinic.id,
        this.billingPlan(),
        clinic.name,
        phone,
      );

      // Store subscription ID in Firestore so we can track it
      await this.clinicStore.update(clinic.id, {
        razorpaySubscriptionId: result.subscriptionId,
      } as Parameters<typeof this.clinicStore.update>[1]);

      // Open WhatsApp with payment link — clinic owner clicks once, Razorpay does the rest
      const waUrl = this.billing.whatsappPaymentMessage(clinic.name, this.billingPlan(), result.shortUrl);
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

  // ── Voice Agent (ElevenLabs) ─────────────────────────────────────────────
  async createVoiceAgent(clinic: StoredClinic) {
    this.creatingVoiceAgent.set(clinic.id);
    try {
      const res = await fetch('/api/elevenlabs-create-agent', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId:            clinic.id,
          name:                clinic.name,
          city:                clinic.city,
          addressLine1:        clinic.addressLine1,
          phone:               clinic.phone,
          doctorName:          clinic.doctorName,
          doctorQualification: clinic.doctorQualification,
          hours:               clinic.hours    ?? [],
          services:            clinic.services ?? [],
        }),
      });
      if (!res.ok) throw new Error('API error');
      const data = await res.json() as { agentId: string };
      this.clinics.update(list =>
        list.map(c => c.id === clinic.id ? { ...c, elevenLabsAgentId: data.agentId } : c)
      );
      this.showToast('ElevenLabs voice agent created! Mic button will appear on the clinic site.', 'success');
    } catch {
      this.showToast('Failed to create voice agent. Check ELEVENLABS_API_KEY in Vercel.', 'error');
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
    this.router.navigate(['/business/clinics', id, 'edit']);
  }

  // ── Toast ─────────────────────────────────────────────────────────────────
  private showToast(msg: string, type: Toast['type']) {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast.set({ msg, type });
    this.toastTimer = setTimeout(() => this.toast.set(null), 3500);
  }
}
