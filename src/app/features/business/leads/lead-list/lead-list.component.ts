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
          note: `WhatsApp sent${next ? ` — status → ${next}` : ''}`,
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
    const msg = this.buildMessage(lead);
    try {
      await navigator.clipboard.writeText(msg);
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copiedId.set(lead.id);
      this.copyTimer = setTimeout(() => this.copiedId.set(null), 2000);
    } catch {
      this.error.set('Copy failed — please copy manually.');
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

  // ── Message builder (used by both sendWhatsApp and copyMessage) ──────────
  buildMessage(lead: StoredLead): string {
    const name     = lead.doctorName
      ? `Dr. ${lead.doctorName.replace(/^dr\.?\s*/i, '')}`
      : lead.clinicName;
    const clinic   = lead.clinicName;

    // Location — prefer area+city for hyper-local feel e.g. "Sector 15, Noida"
    const location = [lead.area, lead.city].filter(Boolean).join(', ');
    const cityLine = location ? ` in ${location}` : '';
    const cityOnly = lead.city ? ` in ${lead.city}` : '';

    // Time-of-day greeting
    const hour     = new Date().getHours();
    const timeGreet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    // Social proof from Google reviews
    const hasRating  = !!lead.rating;
    const ratingLine = hasRating
      ? `⭐ ${lead.rating} rating${lead.reviewCount ? ` · ${lead.reviewCount} patient reviews` : ''} — your patients clearly love you!`
      : '';

    // Category-aware speciality mention
    const cats      = (lead.categories ?? '').toLowerCase();
    const speciality = cats.includes('implant') ? 'dental implants website'
      : cats.includes('cosmet') || cats.includes('smile')  ? 'smile makeover showcase'
      : cats.includes('orthodon') || cats.includes('align') ? 'orthodontics booking page'
      : 'professional dental website';

    // Their own Google Maps listing (shows we did research)
    const mapsRef  = lead.mapsLink
      ? `\n\nI even checked your Google listing: ${lead.mapsLink}`
      : '';

    const demo = `https://indram-dental.vercel.app`;

    const msgs: Record<LeadStatus, string> = {
      new:
`${timeGreet} ${name} 👋

I came across *${clinic}*${cityLine} and was impressed!${mapsRef}
${ratingLine ? '\n' + ratingLine : ''}

I help dental clinics get a *${speciality}* with:
✅ Online appointment booking (24/7)
✅ WhatsApp alert for every new booking
✅ Patient management dashboard
✅ Mobile-friendly, fast & secure

🎬 *Watch how it works (2 min):*
https://youtu.be/R7d1KqfdH6U

👉 Live example: ${demo}

*30-day FREE trial — no credit card needed.*
Your site can be live within 24 hours.

Interested? I can set it up for *${clinic}* today 🙏`,

      contacted:
`${timeGreet} ${name} 👋

Just following up on my earlier message about a *${speciality}* for *${clinic}*${cityLine}.
${ratingLine ? '\nWith ' + ratingLine.replace('— your patients clearly love you!', '') + ', you deserve an online presence that matches.' : ''}
Your patients can book *anytime, even at midnight* — without calling you.

Most clinics see their first online booking within *48 hours* of going live.

🎬 2-min walkthrough: https://youtu.be/R7d1KqfdH6U

Would a quick 10-min call work for you? Completely free, no pressure 🙏`,

      interested:
`${timeGreet} ${name}! 😊

Great to hear you're interested in a website for *${clinic}*${cityLine}!

Here's exactly what you'll get:
🌐 ${speciality.charAt(0).toUpperCase() + speciality.slice(1)} with your branding
📅 Patients book from their phone — day or night
💬 Instant WhatsApp alert to you for every booking
📊 Dashboard to manage & confirm from anywhere
🔒 Secure, HTTPS, fast on mobile
${ratingLine ? '\n' + ratingLine : ''}
*Everything live within 24 hours.*

When are you free for a quick 10-min demo over WhatsApp call? 🙏`,

      demo:
`${timeGreet} ${name}!

Thank you for the demo — really enjoyed showing you what *${clinic}*'s website could look like!

Quick summary of what's included:
✅ Professional website — live in 24 hours
✅ Online booking from patients' phones
✅ Instant WhatsApp notifications for every booking
✅ Admin dashboard — works on phone & laptop
✅ *30-day FREE trial — no card, no commitment*
${ratingLine ? '\nWith your ' + ratingLine.split('—')[0].trim() + ', patients will trust and book instantly.' : ''}
Just reply *"YES"* and I'll have your site live by tomorrow 🚀`,

      converted:
`${timeGreet} ${name}! 🎉

Welcome to *mydentalplatform* — thrilled to have *${clinic}*${cityLine} on board!

I'm setting up your website right now. You'll get a message as soon as it's live.

Feel free to reach out any time — we're here to make this seamless for you.

Thank you for trusting us! 🙏`,

      lost:
`${timeGreet} ${name} 👋

Hope things are going well at *${clinic}*${cityLine}!

Quick update — mydentalplatform has some exciting new features:
✨ AI receptionist that answers patient queries 24/7
✨ Google Reviews integration on your website
✨ Same-day setup — your site goes live today
✨ *Free 30-day trial, no card needed*
${ratingLine ? '\nWith ' + ratingLine.split('—')[0].trim() + ', an online presence would bring in new patients daily.' : ''}
Several clinics${cityOnly} are already live and booking online.

No pressure — want a fresh 10-min demo? 🙏`,
    };

    return msgs[lead.status] ?? msgs.new;
  }

  whatsappLink(lead: StoredLead): string {
    return `https://wa.me/${lead.phone}?text=${encodeURIComponent(this.buildMessage(lead))}`;
  }
}
