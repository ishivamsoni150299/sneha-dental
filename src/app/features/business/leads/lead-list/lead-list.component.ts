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

  leads           = signal<StoredLead[]>([]);
  loading         = signal(true);
  activeTab       = signal<LeadStatus | 'all'>('all');
  search          = signal('');
  sortBy          = signal<'newest' | 'followup'>('newest');
  deleting        = signal<string | null>(null);
  confirmDelete   = signal<string | null>(null);
  updatingStatus  = signal<string | null>(null);
  importingCsv    = signal(false);
  importResult    = signal<{ msg: string; ok: boolean } | null>(null);
  error           = signal<string | null>(null);

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

  sortedLeads = computed(() => {
    const list = [...this.filteredLeads()];
    if (this.sortBy() === 'followup') {
      return list.sort((a, b) => {
        if (!a.followUpDate && !b.followUpDate) return 0;
        if (!a.followUpDate) return 1;
        if (!b.followUpDate) return -1;
        return a.followUpDate.localeCompare(b.followUpDate);
      });
    }
    return list; // newest — already ordered by Firestore
  });

  pipelineStats = computed(() => {
    const stages: LeadStatus[] = ['new', 'contacted', 'interested', 'demo', 'converted', 'lost'];
    return stages.map(s => ({ status: s, count: this.leads().filter(l => l.status === s).length }));
  });

  summaryStats = computed(() => {
    const all       = this.leads();
    const converted = all.filter(l => l.status === 'converted').length;
    const active    = all.filter(l => l.status !== 'converted' && l.status !== 'lost').length;
    const rate      = all.length > 0 ? Math.round((converted / all.length) * 100) : 0;
    return { total: all.length, converted, active, rate, overdue: this.overdueLeads().length };
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

  // ── Quick inline status update ────────────────────────────────────────────
  async quickStatus(lead: StoredLead, status: LeadStatus) {
    if (lead.status === status) return;
    this.updatingStatus.set(lead.id);
    try {
      await this.leadStore.update(lead.id, { status });
      this.leads.update(list => list.map(l => l.id === lead.id ? { ...l, status } : l));
    } catch {
      this.error.set('Could not update status.');
    } finally {
      this.updatingStatus.set(null);
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

  // ── CSV Import ────────────────────────────────────────────────────────────
  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let inQuotes = false;
    let current  = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  async handleCsvImport(event: Event) {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file) return;
    this.importingCsv.set(true);
    try {
      const text  = await file.text();
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) {
        this.importResult.set({ msg: 'CSV has no data rows.', ok: false });
        return;
      }
      const headers = this.parseCSVLine(lines[0]);
      let count = 0;
      for (const line of lines.slice(1)) {
        const vals: Record<string, string> = {};
        this.parseCSVLine(line).forEach((v, i) => { if (headers[i]) vals[headers[i]] = v; });
        if (!vals['clinicName'] || !vals['phone']) continue;
        const digits = vals['phone'].replace(/\D/g, '');
        const phone  = digits.startsWith('91') ? digits : `91${digits}`;
        await this.leadStore.create({
          clinicName:   vals['clinicName'],
          doctorName:   vals['doctorName']   ?? '',
          phone,
          city:         vals['city']         ?? '',
          source:       (vals['source']      as LeadSource) || 'other',
          status:       (vals['status']      as LeadStatus) || 'new',
          followUpDate: vals['followUpDate'] || undefined,
          notes:        vals['notes']        || undefined,
          referredBy:   vals['referredBy']   || undefined,
        });
        count++;
      }
      this.leads.set(await this.leadStore.getAll());
      this.importResult.set({ msg: `Imported ${count} lead${count !== 1 ? 's' : ''}.`, ok: true });
    } catch {
      this.importResult.set({ msg: 'Import failed — check CSV format.', ok: false });
    } finally {
      this.importingCsv.set(false);
      input.value = '';
      setTimeout(() => this.importResult.set(null), 4000);
    }
  }

  // ── CSV Export ────────────────────────────────────────────────────────────
  exportCsv() {
    const rows = this.sortedLeads();
    if (!rows.length) return;
    const headers = ['clinicName','doctorName','phone','city','source','status','followUpDate','notes','referredBy'];
    const escape  = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines   = [
      headers.join(','),
      ...rows.map(l => [
        l.clinicName, l.doctorName, l.phone, l.city,
        l.source, l.status, l.followUpDate ?? '', l.notes ?? '', l.referredBy ?? '',
      ].map(escape).join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href: url,
      download: `leads-${this.activeTab()}-${new Date().toISOString().split('T')[0]}.csv`,
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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

  readonly statuses: Array<{ value: LeadStatus; label: string }> = [
    { value: 'new',        label: 'New' },
    { value: 'contacted',  label: 'Contacted' },
    { value: 'interested', label: 'Interested' },
    { value: 'demo',       label: 'Demo' },
    { value: 'converted',  label: 'Converted ✓' },
    { value: 'lost',       label: 'Lost ✗' },
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
    return new Date(lead.followUpDate + 'T00:00:00').toLocaleDateString('en-IN', {
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
