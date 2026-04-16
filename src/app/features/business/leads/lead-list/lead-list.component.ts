import { Component, signal, computed, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  LeadFirestoreService, StoredLead, LeadStatus, LeadSource,
} from '../../../../core/services/lead-firestore.service';

interface ImportStats {
  imported:    number;
  skipped:     number;   // duplicates
  invalid:     number;   // missing required fields
  writeErrors: number;   // Firestore write failures
  ok:          boolean;
  msg:         string;
}

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
  importResult    = signal<ImportStats | null>(null);
  error           = signal<string | null>(null);

  // ── Computed ──────────────────────────────────────────────────────────────
  filteredLeads = computed(() => {
    let list = this.leads();
    const tab = this.activeTab();
    if (tab !== 'all') list = list.filter(l => l.status === tab);
    const q = this.search().toLowerCase().trim();
    if (q) list = list.filter(l =>
      l.clinicName.toLowerCase().includes(q) ||
      l.doctorName?.toLowerCase().includes(q) ||
      l.city.toLowerCase().includes(q) ||
      (l.area?.toLowerCase().includes(q) ?? false) ||
      (l.address?.toLowerCase().includes(q) ?? false)
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

  // ── CSV Parser ────────────────────────────────────────────────────────────
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

  /**
   * Normalise a CSV header to the internal camelCase field name.
   * Supports both the new human-readable Google Maps export format
   * and the old camelCase format for backwards compatibility.
   */
  private normalizeHeader(h: string): string {
    // Strip BOM, invisible chars, non-breaking spaces before matching
    const clean = h.replace(/[\uFEFF\u200B\u00A0]/g, '').toLowerCase().trim();
    const map: Record<string, string> = {
      // ── New Google Maps CSV format (and common variants) ───────────────
      'clinic name':            'clinicName',
      'name':                   'clinicName',
      'full address':           'address',
      'address':                'address',
      'phone':                  'phone',
      'contact number':         'phone',
      'phone number':           'phone',
      'area / neighborhood':    'area',
      'area/neighborhood':      'area',
      'area / neighbourhood':   'area',
      'area/neighbourhood':     'area',
      'area':                   'area',
      'neighbourhood':          'area',
      'neighborhood':           'area',
      'locality':               'area',
      'sector':                 'area',
      'google rating':          'rating',
      'rating':                 'rating',
      'star rating':            'rating',
      'total reviews':          'reviewCount',
      'reviews':                'reviewCount',
      'review count':           'reviewCount',
      'no. of reviews':         'reviewCount',
      'categories':             'categories',
      'category':               'categories',
      'type':                   'categories',
      'google maps link':       'mapsLink',
      'maps link':              'mapsLink',
      'google maps url':        'mapsLink',
      'maps url':               'mapsLink',
      'link':                   'mapsLink',
      'url':                    'mapsLink',
      'has phone':              '_skip',
      'has rating':             '_skip',
      'source area':            'city',
      // ── Old camelCase format (backwards compat) ────────────────────────
      'clinicname':             'clinicName',
      'doctorname':             'doctorName',
      'city':                   'city',
      'source':                 'source',
      'status':                 'status',
      'followupdate':           'followUpDate',
      'referredby':             'referredBy',
      'notes':                  'notes',
      'reviewcount':            'reviewCount',
      'mapslink':               'mapsLink',
      'doctor name':            'doctorName',
      'doctor':                 'doctorName',
    };
    return map[clean] ?? clean.replace(/\s+/g, '');
  }

  /** Normalise a phone number to Indian E.164 (91XXXXXXXXXX). Returns '' if invalid. */
  private normalizePhone(raw: string): string {
    const digits = raw.replace(/\D/g, '');
    if (!digits) return '';
    return digits.startsWith('91') ? digits : `91${digits}`;
  }

  async handleCsvImport(event: Event) {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file) return;

    this.importingCsv.set(true);
    let stats: ImportStats = { imported: 0, skipped: 0, invalid: 0, writeErrors: 0, ok: false, msg: '' };
    let firstError = '';

    try {
      // Strip UTF-8 BOM (\uFEFF) — Excel / Google Sheets exports include it
      const rawText = await file.text();
      const text    = rawText.replace(/^\uFEFF/, '');

      // Support both \r\n (Windows) and \n line endings
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

      if (lines.length < 2) {
        this.importResult.set({ ...stats, msg: 'CSV has no data rows.' });
        return;
      }

      // Build normalised headers
      const rawHeaders = this.parseCSVLine(lines[0]);
      const headers    = rawHeaders.map(h => this.normalizeHeader(h));

      // Log headers in dev to help debug mismatches
      console.debug('[CSV import] detected columns:', headers);

      // ── Build dedup sets from existing leads (one load, no extra queries) ──
      const existing   = this.leads();
      const usedPhones = new Set(existing.map(l => l.phone).filter(Boolean));
      const usedLinks  = new Set(existing.map(l => l.mapsLink).filter(Boolean) as string[]);

      for (const line of lines.slice(1)) {
        const vals: Record<string, string> = {};
        this.parseCSVLine(line).forEach((v, i) => {
          const key = headers[i];
          if (key && key !== '_skip') vals[key] = v.trim();
        });

        // Required: clinic name (non-empty after trim)
        if (!vals['clinicName']?.trim()) { stats.invalid++; continue; }

        const phone    = this.normalizePhone(vals['phone'] ?? '');
        const mapsLink = vals['mapsLink'] ?? '';

        // ── Duplicate check ──────────────────────────────────────────────
        // Primary key: Google Maps link (unique per listing)
        // Secondary key: phone number
        const isDuplicate =
          (mapsLink && usedLinks.has(mapsLink)) ||
          (phone    && usedPhones.has(phone));

        if (isDuplicate) { stats.skipped++; continue; }

        // Use `area` as city fallback when no separate city column
        const city = vals['city'] || vals['area'] || '';

        const ratingRaw      = parseFloat(vals['rating'] ?? '');
        const reviewCountRaw = parseInt(vals['reviewCount'] ?? '', 10);

        try {
          await this.leadStore.create({
            clinicName:   vals['clinicName'].trim(),
            doctorName:   vals['doctorName']   ?? '',
            phone,
            city,
            source:       (vals['source'] as LeadSource) || 'google_maps',
            status:       (vals['status'] as LeadStatus) || 'new',
            followUpDate: vals['followUpDate'] || undefined,
            notes:        vals['notes']        || undefined,
            referredBy:   vals['referredBy']   || undefined,
            address:      vals['address']      || undefined,
            area:         vals['area']         || undefined,
            rating:       isNaN(ratingRaw)      ? undefined : ratingRaw,
            reviewCount:  isNaN(reviewCountRaw) ? undefined : reviewCountRaw,
            categories:   vals['categories']   || undefined,
            mapsLink:     mapsLink             || undefined,
          });

          // Add to dedup sets so same-file duplicates are caught
          if (phone)    usedPhones.add(phone);
          if (mapsLink) usedLinks.add(mapsLink);

          stats.imported++;
        } catch (writeErr: unknown) {
          stats.writeErrors++;
          if (!firstError) {
            const code = (writeErr as { code?: string })?.code;
            const msg  = (writeErr as { message?: string })?.message ?? String(writeErr);
            firstError = code ? `${code}: ${msg}` : msg;
          }
          console.error('[CSV import] write failed for row:', vals['clinicName'], writeErr);
        }
      }

      if (stats.imported > 0) {
        this.leads.set(await this.leadStore.getAll());
      }

      stats.ok = stats.imported > 0 || (stats.skipped > 0 && stats.writeErrors === 0);

      const parts: string[] = [];
      if (stats.imported    > 0) parts.push(`${stats.imported} imported`);
      if (stats.skipped     > 0) parts.push(`${stats.skipped} skipped (duplicates)`);
      if (stats.invalid     > 0) parts.push(`${stats.invalid} missing clinic name`);
      if (stats.writeErrors > 0) parts.push(`${stats.writeErrors} write errors`);

      if (parts.length === 0) stats.msg = 'No new leads found — all rows were duplicates or invalid.';
      else stats.msg = parts.join(' · ');

      if (firstError) stats.msg += ` — ${firstError}`;

    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? String(e);
      stats.msg = `Import failed: ${msg}`;
      console.error('[CSV import] unexpected error:', e);
    } finally {
      this.importingCsv.set(false);
      input.value = '';
      this.importResult.set(stats);
      setTimeout(() => this.importResult.set(null), 10_000);
    }
  }

  // ── CSV Export ────────────────────────────────────────────────────────────
  exportCsv() {
    const rows = this.sortedLeads();
    if (!rows.length) return;
    const headers = [
      'clinicName', 'doctorName', 'phone', 'city', 'source', 'status',
      'followUpDate', 'notes', 'referredBy',
      'address', 'area', 'rating', 'reviewCount', 'categories', 'mapsLink',
    ];
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines  = [
      headers.join(','),
      ...rows.map(l => [
        l.clinicName, l.doctorName, l.phone, l.city,
        l.source, l.status, l.followUpDate ?? '', l.notes ?? '', l.referredBy ?? '',
        l.address ?? '', l.area ?? '', l.rating ?? '', l.reviewCount ?? '',
        l.categories ?? '', l.mapsLink ?? '',
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

  ratingStars(rating: number): number[] {
    return Array.from({ length: 5 }, (_, i) => i + 1);
  }

  whatsappLink(lead: StoredLead): string {
    const msgs: Record<LeadStatus, string> = {
      new:        `Hi ${lead.doctorName || lead.clinicName}! I build professional websites for dental clinics — with online booking, WhatsApp integration, and a patient dashboard. Live in 24 hours. Free 30-day trial. Here's a live example: https://indram-dental.vercel.app — Interested?`,
      contacted:  `Hi ${lead.doctorName || lead.clinicName}! Just following up on the dental website I mentioned. Happy to answer any questions or set up a quick demo. Let me know!`,
      interested: `Hi ${lead.doctorName || lead.clinicName}! Great to hear you're interested. I can set up a live demo of your clinic's website this week — which day works best for you?`,
      demo:       `Hi ${lead.doctorName || lead.clinicName}! Following up after our demo. Ready to go live? I can have your clinic website up in 24 hours. Free trial — no card needed to start.`,
      converted:  `Hi ${lead.doctorName || lead.clinicName}! Thanks for choosing mydentalplatform. I'll get started on your site right away!`,
      lost:       `Hi ${lead.doctorName || lead.clinicName}! Reaching out again — we now offer a free 30-day trial with no card required. Would love to show you what's new. No obligation at all!`,
    };
    const msg = msgs[lead.status] ?? msgs.new;
    return `https://wa.me/${lead.phone}?text=${encodeURIComponent(msg)}`;
  }
}
