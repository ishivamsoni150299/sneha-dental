import { Component, signal, computed, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  LeadFirestoreService, StoredLead, LeadStatus, LeadSource,
} from '../../../../core/services/lead-firestore.service';

@Component({
  selector: 'app-lead-list',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './lead-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LeadListComponent implements OnInit {
  private leadStore = inject(LeadFirestoreService);

  leads         = signal<StoredLead[]>([]);
  loading       = signal(true);
  activeTab     = signal<LeadStatus | 'all'>('all');
  search        = signal('');
  deleting      = signal<string | null>(null);
  confirmDelete = signal<string | null>(null);
  error         = signal<string | null>(null);

  // ── Computed ──────────────────────────────────────────────────────────────
  filteredLeads = computed(() => {
    let list = this.leads();
    const tab = this.activeTab();
    if (tab !== 'all') list = list.filter(l => l.status === tab);
    const q = this.search().toLowerCase().trim();
    if (q) list = list.filter(l =>
      l.clinicName.toLowerCase().includes(q) ||
      l.doctorName.toLowerCase().includes(q) ||
      l.city.toLowerCase().includes(q)
    );
    return list;
  });

  pipelineStats = computed(() => {
    const stages: LeadStatus[] = ['new', 'contacted', 'interested', 'demo', 'converted', 'lost'];
    return stages.map(s => ({ status: s, count: this.leads().filter(l => l.status === s).length }));
  });

  overdueLeads = computed(() => {
    const today = new Date().toISOString().split('T')[0];
    return this.leads().filter(l =>
      l.followUpDate && l.followUpDate <= today &&
      l.status !== 'converted' && l.status !== 'lost'
    );
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  async ngOnInit() {
    try {
      this.leads.set(await this.leadStore.getAll());
    } catch {
      this.error.set('Failed to load leads.');
    } finally {
      this.loading.set(false);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async deleteLead(id: string) {
    this.deleting.set(id);
    try {
      await this.leadStore.remove(id);
      this.leads.update(list => list.filter(l => l.id !== id));
      this.confirmDelete.set(null);
    } finally {
      this.deleting.set(null);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  readonly tabs: Array<{ key: LeadStatus | 'all'; label: string }> = [
    { key: 'all',        label: 'All' },
    { key: 'new',        label: 'New' },
    { key: 'contacted',  label: 'Contacted' },
    { key: 'interested', label: 'Interested' },
    { key: 'demo',       label: 'Demo' },
    { key: 'converted',  label: 'Converted' },
    { key: 'lost',       label: 'Lost' },
  ];

  statusLabel(s: LeadStatus): string {
    const map: Record<LeadStatus, string> = {
      new: 'New', contacted: 'Contacted', interested: 'Interested',
      demo: 'Demo Scheduled', converted: 'Converted', lost: 'Lost',
    };
    return map[s] ?? s;
  }

  statusClasses(s: LeadStatus): string {
    const map: Record<LeadStatus, string> = {
      new:        'bg-gray-100 text-gray-600',
      contacted:  'bg-blue-100 text-blue-700',
      interested: 'bg-yellow-100 text-yellow-700',
      demo:       'bg-purple-100 text-purple-700',
      converted:  'bg-green-100 text-green-700',
      lost:       'bg-red-100 text-red-600',
    };
    return map[s] ?? 'bg-gray-100 text-gray-600';
  }

  sourceLabel(s: LeadSource): string {
    const map: Record<LeadSource, string> = {
      google_maps: 'Google Maps',
      instagram:   'Instagram',
      referral:    'Referral',
      ida:         'IDA',
      walkin:      'Walk-in',
      other:       'Other',
    };
    return map[s] ?? s;
  }

  isOverdue(lead: StoredLead): boolean {
    if (!lead.followUpDate) return false;
    const today = new Date().toISOString().split('T')[0];
    return lead.followUpDate <= today && lead.status !== 'converted' && lead.status !== 'lost';
  }

  followUpLabel(lead: StoredLead): string {
    if (!lead.followUpDate) return '';
    return new Date(lead.followUpDate).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short',
    });
  }

  whatsappLink(lead: StoredLead): string {
    const msgs: Record<LeadStatus, string> = {
      new:        `Hi ${lead.doctorName}! I build professional websites for dental clinics — with online booking, WhatsApp integration, and a patient dashboard. Live in 24 hours. Free 30-day trial. Here's a live example: https://indram-dental.vercel.app — Interested?`,
      contacted:  `Hi ${lead.doctorName}! Just following up on the dental website I mentioned. Happy to answer any questions or set up a quick demo. Let me know!`,
      interested: `Hi ${lead.doctorName}! Great to hear you're interested. I can set up a live demo of your clinic's website this week — which day works best for you?`,
      demo:       `Hi ${lead.doctorName}! Following up after our demo. Ready to go live? I can have your clinic website up in 24 hours. Free trial — no card needed to start.`,
      converted:  `Hi ${lead.doctorName}! Thanks for choosing mydentalplatform. I'll get started on your site right away!`,
      lost:       `Hi ${lead.doctorName}! Reaching out again — we now offer a free 30-day trial with no card required. Would love to show you what's new. No obligation at all!`,
    };
    const msg = msgs[lead.status] ?? msgs.new;
    return `https://wa.me/${lead.phone}?text=${encodeURIComponent(msg)}`;
  }
}
