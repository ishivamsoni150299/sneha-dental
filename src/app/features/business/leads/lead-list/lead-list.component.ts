import { Component, signal, computed, ChangeDetectionStrategy, inject, OnInit, OnDestroy } from '@angular/core';
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

interface WhatsAppPlan {
  template: string;
  buttonLabel: string;
  preview: string;
  message: string;
  activityNote: string;
}

interface MessageDraft {
  leadId: string;
  label: string;
  message: string;
}

const SENDER_NAME  = 'Shivam Soni';
const SENDER_PHONE = '9140210648';
const PLATFORM_URL = 'https://www.mydentalplatform.com';
const SENDER_SIG   = `\n\n— ${SENDER_NAME}\n📞 ${SENDER_PHONE}\n🌐 ${PLATFORM_URL}`;

const DEMO_WEBSITE_URL = 'https://arogyamdental.mydentalplatform.com';
const DEMO_VIDEO_URL   = 'https://youtu.be/cJGhGCDmyAk?si=lzHGpFTOp9WtMxMX';
const DEMO_VIDEO_LINE  = `🎬 See a live client dental website:\n${DEMO_VIDEO_URL}`;
const SETUP_VIDEO_URL  = 'https://youtu.be/R7d1KqfdH6U?si=LM69y0o5dr5P132S';
const SETUP_VIDEO_LINE = `🔧 How to set up your free dental website:\n${SETUP_VIDEO_URL}`;

@Component({
  selector: 'app-lead-list',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './lead-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LeadListComponent implements OnInit, OnDestroy {
  private leadStore = inject(LeadFirestoreService);

  leads           = signal<StoredLead[]>([]);
  loading         = signal(true);
  activeTab       = signal<LeadStatus | 'all'>('all');
  search          = signal('');
  sortBy          = signal<'newest' | 'followup' | 'score'>('newest');
  deleting        = signal<string | null>(null);
  confirmDelete   = signal<string | null>(null);
  updatingStatus  = signal<string | null>(null);
  importingCsv    = signal(false);
  importResult    = signal<ImportStats | null>(null);
  error           = signal<string | null>(null);

  // ── New interaction state ─────────────────────────────────────────────────
  copiedId        = signal<string | null>(null);   // feedback after copy
  sendingWa       = signal<string | null>(null);   // WA button loading state
  inlineNote      = signal<{ leadId: string; text: string } | null>(null);
  savingNote      = signal(false);
  messageDraft    = signal<MessageDraft | null>(null);
  savingMessage   = signal(false);
  private copyTimer: ReturnType<typeof setTimeout> | null = null;

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
    if (this.sortBy() === 'score') {
      return list.sort((a, b) => this.leadScore(b) - this.leadScore(a));
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

  /** Top 5 cities by lead count with per-city conversion rate. */
  cityStats = computed(() => {
    const map = new Map<string, { total: number; converted: number }>();
    for (const l of this.leads()) {
      const city = (l.city || l.area || 'Unknown').trim();
      const entry = map.get(city) ?? { total: 0, converted: 0 };
      entry.total++;
      if (l.status === 'converted') entry.converted++;
      map.set(city, entry);
    }
    return Array.from(map.entries())
      .map(([city, d]) => ({
        city,
        total:     d.total,
        converted: d.converted,
        rate:      d.total > 0 ? Math.round((d.converted / d.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
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

  ngOnDestroy() {
    if (this.copyTimer) clearTimeout(this.copyTimer);
  }

  // ── Quick inline status update ────────────────────────────────────────────
  async quickStatus(lead: StoredLead, status: LeadStatus) {
    if (lead.status === status) return;
    this.updatingStatus.set(lead.id);
    try {
      const updates: Partial<StoredLead> = { status };
      // Auto-set follow-up date when advancing the pipeline (only if not already set)
      const autoFollowUp: Partial<Record<LeadStatus, number>> = {
        contacted: 2, interested: 1, demo: 3,
      };
      const daysAhead = autoFollowUp[status];
      if (daysAhead && !lead.followUpDate) {
        const d = new Date();
        d.setDate(d.getDate() + daysAhead);
        updates.followUpDate = d.toISOString().split('T')[0];
      }
      await this.leadStore.update(lead.id, updates);
      this.leads.update(list => list.map(l => l.id === lead.id ? { ...l, ...updates } : l));
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

  // ── Lead scoring ─────────────────────────────────────────────────────────
  leadScore(lead: StoredLead): number {
    let score = 0;
    if (lead.rating)      score += lead.rating * 10;                        // 0 – 50
    if (lead.reviewCount) score += Math.min(lead.reviewCount * 0.1, 20);    // 0 – 20 cap
    const sourceBonus: Partial<Record<LeadSource, number>> = {
      referral: 30, walkin: 25, ida: 20, google_maps: 10, instagram: 5,
    };
    score += sourceBonus[lead.source] ?? 0;
    return Math.round(score);
  }

  isHotLead(lead: StoredLead): boolean { return this.leadScore(lead) >= 60; }

  // ── Inline quick note ─────────────────────────────────────────────────────
  startNoteEdit(lead: StoredLead) {
    this.inlineNote.set({ leadId: lead.id, text: lead.notes ?? '' });
  }

  cancelNoteEdit() { this.inlineNote.set(null); }

  updateNoteText(text: string) {
    const n = this.inlineNote();
    if (n) this.inlineNote.set({ ...n, text });
  }

  async saveInlineNote(lead: StoredLead) {
    const note = this.inlineNote();
    if (!note || note.leadId !== lead.id) return;
    this.savingNote.set(true);
    try {
      const text = note.text.trim() || undefined;
      await this.leadStore.update(lead.id, { notes: text });
      this.leads.update(list => list.map(l => l.id === lead.id ? { ...l, notes: text } : l));
      this.inlineNote.set(null);
    } catch {
      this.error.set('Could not save note.');
    } finally {
      this.savingNote.set(false);
    }
  }

  // ── Send WhatsApp + auto-log + auto-advance ───────────────────────────────
  async sendWhatsApp(lead: StoredLead) {
    if (!lead.phone) return;
    this.sendingWa.set(lead.id);
    const plan = this.buildWhatsAppPlan(lead);
    window.open(this.whatsappLink(lead), '_blank', 'noopener,noreferrer');

    try {
      const nextStatus: Partial<Record<LeadStatus, LeadStatus>> = { new: 'contacted' };
      const autoFollowUp: Partial<Record<LeadStatus, number>> = {
        new: 2, contacted: 2, interested: 1, demo: 3,
      };
      const next       = nextStatus[lead.status];
      const daysAhead  = autoFollowUp[lead.status] ?? 2;
      const followUp   = new Date();
      followUp.setDate(followUp.getDate() + daysAhead);

      const updates: Partial<StoredLead> = {
        followUpDate: followUp.toISOString().split('T')[0],
        ...(next ? { status: next } : {}),
      };

      await Promise.all([
        this.leadStore.update(lead.id, updates),
        this.leadStore.addActivity(lead.id, {
          type: 'whatsapp',
          note: `${plan.activityNote}${next ? ` — status → ${next}` : ''}`,
        }),
      ]);

      this.leads.update(list => list.map(l => l.id === lead.id ? { ...l, ...updates } : l));
    } catch {
      // Non-fatal — the WA message was already opened
    } finally {
      this.sendingWa.set(null);
    }
  }

  // ── Copy message to clipboard ─────────────────────────────────────────────
  async copyMessage(lead: StoredLead) {
    const msg = this.buildDynamicMessage(lead);
    try {
      await navigator.clipboard.writeText(msg);
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copiedId.set(lead.id);
      this.copyTimer = setTimeout(() => this.copiedId.set(null), 2000);
    } catch {
      this.error.set('Copy failed — please copy manually.');
    }
  }

  startMessageEdit(lead: StoredLead) {
    const plan = this.buildWhatsAppPlan(lead);
    this.messageDraft.set({
      leadId: lead.id,
      label: lead.whatsappTemplateLabel?.trim() || plan.template,
      message: lead.whatsappMessage?.trim() || plan.message,
    });
  }

  cancelMessageEdit() {
    this.messageDraft.set(null);
  }

  updateMessageLabel(label: string) {
    const draft = this.messageDraft();
    if (!draft) return;
    this.messageDraft.set({ ...draft, label });
  }

  updateMessageBody(message: string) {
    const draft = this.messageDraft();
    if (!draft) return;
    this.messageDraft.set({ ...draft, message });
  }

  async saveMessageEdit(lead: StoredLead) {
    const draft = this.messageDraft();
    if (!draft || draft.leadId !== lead.id) return;

    this.savingMessage.set(true);
    try {
      const label = draft.label.trim() || undefined;
      const message = draft.message.trim() || undefined;
      await this.leadStore.update(lead.id, {
        whatsappTemplateLabel: label,
        whatsappMessage: message,
      });
      this.leads.update(list => list.map(item => item.id === lead.id ? {
        ...item,
        whatsappTemplateLabel: label,
        whatsappMessage: message,
      } : item));
      this.messageDraft.set(null);
    } catch {
      this.error.set('Could not save WhatsApp message.');
    } finally {
      this.savingMessage.set(false);
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

  readonly templateOptions: Array<{ status: LeadStatus; label: string }> = [
    { status: 'new',        label: 'First Touch' },
    { status: 'contacted',  label: 'Follow-up' },
    { status: 'interested', label: 'Proposal' },
    { status: 'demo',       label: 'Demo Close' },
    { status: 'converted',  label: 'Welcome' },
    { status: 'lost',       label: 'Re-engage' },
  ];

  loadTemplate(status: LeadStatus, lead: StoredLead) {
    const plan = this.buildWhatsAppPlan(lead, status);
    const draft = this.messageDraft();
    if (draft) this.messageDraft.set({ ...draft, label: plan.template, message: plan.message });
  }

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
    return `https://wa.me/${lead.phone}?text=${encodeURIComponent(this.buildDynamicMessage(lead))}`;
  }

  messageTemplate(lead: StoredLead): string {
    return this.buildWhatsAppPlan(lead).template;
  }

  messageButtonLabel(lead: StoredLead): string {
    return this.buildWhatsAppPlan(lead).buttonLabel;
  }

  messagePreview(lead: StoredLead): string {
    return this.buildWhatsAppPlan(lead).preview;
  }

  private buildDynamicMessage(lead: StoredLead): string {
    return this.buildWhatsAppPlan(lead).message;
  }

  private buildWhatsAppPlan(lead: StoredLead, forceStatus?: LeadStatus): WhatsAppPlan {
    const clinic = lead.clinicName.trim();
    const contactName = this.contactName(lead);
    const greeting = this.timeGreeting();
    const location = this.fullLocation(lead);
    const city = (lead.city || lead.area || 'your area').trim();
    const locationLine = location ? ` in ${location}` : '';
    const proofLine = this.proofLine(lead);
    const speciality = this.specialityLine(lead);
    const sourceIntro = this.sourceIntro(lead, clinic, locationLine);
    const clinicShort = clinic.length > 34 ? `${clinic.slice(0, 34)}...` : clinic;
    const bookingOutcome = city ? `get more patient bookings in ${city}` : 'get more patient bookings';
    const referredBy = lead.referredBy?.trim();

    const plans: Record<LeadStatus, WhatsAppPlan> = {
      new: {
        template: 'First Touch',
        buttonLabel: 'First message',
        preview: `First outreach for ${clinicShort}${city ? ` in ${city}` : ''}`,
        activityNote: `Sent first-touch WhatsApp for ${clinicShort}`,
        message:
`${greeting} ${contactName},

${sourceIntro}

I help dental clinics like *${clinic}*${locationLine} get more patient bookings with a complete website and WhatsApp-first booking flow — no tech work needed from your side.

What is included:
- Patients book appointments 24/7 directly from your site
- Instant WhatsApp alert to you for every new enquiry
- Mobile-friendly clinic page with services, timing and contact
- Dashboard to confirm, follow up and manage from anywhere
${speciality ? `\nFor *${clinic}*, I would build the site around ${speciality}.` : ''}
${proofLine ? `\n${proofLine}` : ''}

👉 *Live demo clinic (same as what your clinic would look like):*
${DEMO_WEBSITE_URL}

${DEMO_VIDEO_LINE}

${SETUP_VIDEO_LINE}

Can I put together a quick sample idea specifically for *${clinic}* in ${city}?${SENDER_SIG}`,
      },
      contacted: {
        template: 'Follow-up',
        buttonLabel: 'Follow up',
        preview: `Follow-up for ${clinicShort}${city ? ` in ${city}` : ''}`,
        activityNote: `Sent follow-up WhatsApp for ${clinicShort}`,
        message:
`${greeting} ${contactName},

Following up on my earlier message about helping *${clinic}*${locationLine} get more patients online.
${proofLine ? `\n${proofLine}` : ''}

Three things that make a difference for clinics in ${city}:
- Patients can enquire after clinic hours without calling
- You get a WhatsApp alert the moment someone requests a booking
- Your clinic looks more trusted to new patients searching online

👉 *Live demo clinic:*
${DEMO_WEBSITE_URL}

${DEMO_VIDEO_LINE}

Would a quick 10-minute WhatsApp call work for you this week? No pressure — just happy to walk you through it.${SENDER_SIG}`,
      },
      interested: {
        template: 'Proposal Push',
        buttonLabel: 'Send proposal',
        preview: `Proposal for interested lead ${clinicShort}`,
        activityNote: `Sent proposal WhatsApp for ${clinicShort}`,
        message:
`${greeting} ${contactName},

Great to know you are open to this for *${clinic}*${locationLine}. Let me share exactly what I would set up.

What goes live:
- Branded dental website with your clinic name, logo and colours
- Appointment booking form connected directly to your WhatsApp
- Separate pages for each service — cleanings, fillings, implants, cosmetics and more
- Mobile-first design so patients on phones can book in seconds
- Admin dashboard to confirm and manage from your phone or laptop
${speciality ? `\nThe site would focus on ${speciality}.` : ''}
${proofLine ? `\n${proofLine}` : ''}

*Your website can be live within 24 hours.*

👉 *Live demo clinic:*
${DEMO_WEBSITE_URL}

${DEMO_VIDEO_LINE}

${SETUP_VIDEO_LINE}

When are you free for a quick 10-minute demo call?${SENDER_SIG}`,
      },
      demo: {
        template: 'Demo Close',
        buttonLabel: 'Close lead',
        preview: `Post-demo close message for ${clinicShort}`,
        activityNote: `Sent post-demo WhatsApp for ${clinicShort}`,
        message:
`${greeting} ${contactName},

Thank you for your time today — it was great showing you what *${clinic}*${locationLine} could look like.

Quick summary of what is included:
- Professional dental website — live within 24 hours
- Patients book directly from your site, any time of day
- Instant WhatsApp alert for every new booking request
- Admin dashboard — works on phone and laptop
- Full setup handled by us — no work from your side
${proofLine ? `\n${proofLine}` : ''}

👉 *Demo clinic again for reference:*
${DEMO_WEBSITE_URL}

${DEMO_VIDEO_LINE}

Just reply *YES* and I will move ahead with the setup for *${clinic}* today.${SENDER_SIG}`,
      },
      converted: {
        template: 'Welcome Onboard',
        buttonLabel: 'Welcome note',
        preview: `Onboarding welcome for ${clinicShort}`,
        activityNote: `Sent onboarding WhatsApp for ${clinicShort}`,
        message:
`${greeting} ${contactName},

Welcome to mydentalplatform — we are excited to get *${clinic}*${locationLine} live!

Here is what happens next:
- We prepare your clinic website with your branding
- Connect the booking form to your WhatsApp number
- Share the live link with you to review and approve
- Go live — patients in ${city} can start booking online

If you have your logo, doctor photo, services list or clinic timing ready, please share them here and we will get started right away.

Your website will be live within 24 hours.${SENDER_SIG}`,
      },
      lost: {
        template: 'Re-engage',
        buttonLabel: 'Reconnect',
        preview: `Re-engagement for ${clinicShort}${city ? ` in ${city}` : ''}`,
        activityNote: `Sent re-engagement WhatsApp for ${clinicShort}`,
        message:
`${greeting} ${contactName},

Hope things are going well at *${clinic}*${locationLine}.

Reaching out again because a few things have improved on mydentalplatform:
- Same-day setup — your clinic can be live today
- AI receptionist that handles patient queries after clinic hours
- Better booking experience for patients on mobile
- Several clinics in ${city} are already live and getting bookings
- Still free for the first 30 days, no card needed
${proofLine ? `\n${proofLine}` : ''}
${referredBy ? `\nSince ${referredBy} had mentioned your clinic earlier, I wanted to reconnect.` : ''}

👉 *Updated live demo:*
${DEMO_WEBSITE_URL}

${DEMO_VIDEO_LINE}

No pressure at all — if the timing works better now, I am happy to do a fresh 10-minute demo.${SENDER_SIG}`,
      },
    };

    const basePlan = plans[forceStatus ?? lead.status] ?? plans.new;

    // When forceStatus is given (template quick-switch), always use the fresh template — ignore any saved custom message
    if (forceStatus) {
      const previewLine = basePlan.message.split('\n').find(line => line.trim())?.trim() ?? basePlan.preview;
      return { ...basePlan, preview: previewLine };
    }

    const customLabel = lead.whatsappTemplateLabel?.trim();
    const customMessage = lead.whatsappMessage?.trim();
    const resolvedMessage = customMessage || basePlan.message;
    const previewLine = resolvedMessage.split('\n').find(line => line.trim())?.trim() ?? basePlan.preview;

    return {
      ...basePlan,
      template: customLabel || basePlan.template,
      preview: previewLine,
      message: resolvedMessage,
      activityNote: customLabel
        ? `Sent ${customLabel.toLowerCase()} WhatsApp for ${clinicShort}`
        : basePlan.activityNote,
    };
  }

  private contactName(lead: StoredLead): string {
    const cleanedDoctor = lead.doctorName?.replace(/^dr\.?\s*/i, '').trim();
    return cleanedDoctor ? `Dr. ${cleanedDoctor}` : lead.clinicName.trim();
  }

  private fullLocation(lead: StoredLead): string {
    return [lead.area?.trim(), lead.city?.trim()].filter(Boolean).join(', ');
  }

  private timeGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  private proofLine(lead: StoredLead): string {
    if (!lead.rating) return '';
    const reviews = lead.reviewCount ? ` from ${lead.reviewCount} patient reviews` : '';
    return `Your Google presence already looks strong with a ${lead.rating} rating${reviews}.`;
  }

  private specialityLine(lead: StoredLead): string {
    const categories = (lead.categories ?? '').toLowerCase();
    if (categories.includes('implant')) return 'dental implants and advanced treatment trust';
    if (categories.includes('cosmet') || categories.includes('smile')) return 'smile design and cosmetic dentistry';
    if (categories.includes('orthodon') || categories.includes('align')) return 'braces, aligners and consultation conversion';
    if (categories.includes('child') || categories.includes('pediatric')) return 'family-friendly pediatric dental care';
    return 'clean booking experience and local patient trust';
  }

  private sourceIntro(lead: StoredLead, clinic: string, locationLine: string): string {
    switch (lead.source) {
      case 'google_maps':
        return `I came across *${clinic}*${locationLine} while reviewing dental clinics on Google Maps.`;
      case 'instagram':
        return `I found *${clinic}* through social media and wanted to reach out with a simple growth idea.`;
      case 'referral':
        return lead.referredBy
          ? `${lead.referredBy} suggested I speak with you about helping *${clinic}* improve patient enquiries online.`
          : `A referral suggested I connect with *${clinic}* about improving patient enquiries online.`;
      case 'ida':
        return 'I am reaching out because many IDA-connected clinics are now moving bookings and follow-up to a website plus WhatsApp flow.';
      case 'walkin':
        return `I noticed *${clinic}*${locationLine} and thought your clinic could benefit from a stronger online booking setup.`;
      default:
        return `I wanted to reach out regarding *${clinic}*${locationLine} and share a simple patient booking setup idea.`;
    }
  }
}
