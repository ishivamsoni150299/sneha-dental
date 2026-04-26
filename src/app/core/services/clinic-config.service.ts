import { Injectable, signal } from '@angular/core';
import { collection, getDocs, query, where, limit, doc, updateDoc } from 'firebase/firestore';
import { CLINIC_THEMES, clinicConfig, type ClinicConfig, type ClinicTheme } from '../config/clinic.config';
export type { ClinicConfig };
import { db } from '../firebase';

// ── Premium theme palettes ────────────────────────────────────────────────────
// Each palette maps CSS variable names → hex/rgba values.
// Applied to document.documentElement so the entire clinic site picks them up.
const THEME_PALETTES: Record<ClinicTheme, Record<string, string>> = {
  blue: {
    '--accent':    '#1E56DC',
    '--accent-dk': '#1235A9',
    '--accent-md': '#3B7BF8',
    '--accent-lt': '#EBF2FF',
    '--accent-bd': '#93C5FD',
    '--accent-sh': 'rgba(30, 86, 220, 0.20)',
  },
  teal: {
    '--accent':    '#0B7285',
    '--accent-dk': '#085E6F',
    '--accent-md': '#0EA5C4',
    '--accent-lt': '#ECFEFF',
    '--accent-bd': '#67E8F9',
    '--accent-sh': 'rgba(11, 114, 133, 0.20)',
  },
  emerald: {
    '--accent':    '#047857',
    '--accent-dk': '#065F46',
    '--accent-md': '#059669',
    '--accent-lt': '#ECFDF5',
    '--accent-bd': '#6EE7B7',
    '--accent-sh': 'rgba(4, 120, 87, 0.20)',
  },
  purple: {
    '--accent':    '#0F4C81',
    '--accent-dk': '#0B3657',
    '--accent-md': '#3B82C4',
    '--accent-lt': '#EEF6FB',
    '--accent-bd': '#93C5E6',
    '--accent-sh': 'rgba(15, 76, 129, 0.18)',
  },
  rose: {
    '--accent':    '#0891B2',
    '--accent-dk': '#0E7490',
    '--accent-md': '#06B6D4',
    '--accent-lt': '#ECFEFF',
    '--accent-bd': '#67E8F9',
    '--accent-sh': 'rgba(8, 145, 178, 0.18)',
  },
  caramel: {
    '--accent':    '#4D7C8A',
    '--accent-dk': '#325764',
    '--accent-md': '#6DA7BA',
    '--accent-lt': '#F4F9FB',
    '--accent-bd': '#BDD9E3',
    '--accent-sh': 'rgba(77, 124, 138, 0.18)',
  },
};

const THEME_CLASS_NAMES = CLINIC_THEMES.map(theme => `theme-${theme}`);

function buildSemanticTokens(palette: Record<string, string>): Record<string, string> {
  return {
    '--color-bg': '#f5f7fb',
    '--color-surface': 'rgba(255, 255, 255, 0.84)',
    '--color-surface-elevated': '#ffffff',
    '--color-surface-muted': 'color-mix(in srgb, white 62%, var(--accent-lt))',
    '--color-line': 'color-mix(in srgb, #cbd5e1 74%, var(--accent-bd))',
    '--color-line-strong': 'color-mix(in srgb, #94a3b8 72%, var(--accent-bd))',
    '--color-text': '#0f172a',
    '--color-text-soft': '#334155',
    '--color-text-muted': '#64748b',
    '--color-primary': palette['--accent'],
    '--color-primary-hover': palette['--accent-dk'],
    '--color-primary-soft': palette['--accent-lt'],
    '--color-primary-border': palette['--accent-bd'],
    '--color-primary-shadow': palette['--accent-sh'],
    '--color-focus-ring': 'color-mix(in srgb, transparent 84%, var(--accent))',
    '--page-orb-left': palette['--accent-lt'],
    '--page-orb-right': 'color-mix(in srgb, white 52%, var(--accent-lt))',
  };
}

function normalizeTheme(theme: string | undefined): ClinicTheme {
  return CLINIC_THEMES.includes(theme as ClinicTheme) ? (theme as ClinicTheme) : 'blue';
}

function applyTheme(theme: string | undefined) {
  if (typeof document === 'undefined') return;
  const resolvedTheme = normalizeTheme(theme);
  const palette = THEME_PALETTES[resolvedTheme];
  const semanticTokens = buildSemanticTokens(palette);
  const root = document.documentElement;
  root.classList.remove(...THEME_CLASS_NAMES);
  root.classList.add(`theme-${resolvedTheme}`);
  root.setAttribute('data-clinic-theme', resolvedTheme);
  [...new Set([...Object.keys(THEME_PALETTES.blue), ...Object.keys(semanticTokens)])]
    .forEach(prop => root.style.removeProperty(prop));
  Object.entries({ ...palette, ...semanticTokens })
    .forEach(([prop, val]) => root.style.setProperty(prop, val));
}

@Injectable({ providedIn: 'root' })
export class ClinicConfigService {
  private readonly _config   = signal<ClinicConfig>(clinicConfig);
  private readonly _isLoaded = signal<boolean>(false);

  constructor() {
    applyTheme(this._config().theme);
  }

  /** Current clinic config — synchronous, always has a value. */
  get config(): ClinicConfig { return this._config(); }

  /**
   * True once a real clinic config has been loaded from Firestore (or on localhost).
   * False when running on a platform/admin-only domain with no matching clinic doc.
   */
  get isLoaded(): boolean { return this._isLoaded(); }

  /**
   * Called once by APP_INITIALIZER before the app renders.
   * Tries to match by custom domain first, then by vercelDomain as fallback.
   * On localhost, skips Firestore and uses the static fallback.
   * Never throws — falls back to static config on any error.
   */
  async loadFromFirestore(): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }

    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      applyTheme(this._config().theme); // apply default/static config theme in dev
      this._isLoaded.set(true);
      return;
    }
    try {
      // 1st attempt — match on primary custom domain
      let snap = await getDocs(query(
        collection(db, 'clinics'),
        where('domain', '==', host),
        where('active', '==', true),
        limit(1)
      ));

      // 2nd attempt — fall back to vercelDomain (e.g. sneha-dental.vercel.app)
      if (snap.empty) {
        snap = await getDocs(query(
          collection(db, 'clinics'),
          where('vercelDomain', '==', host),
          where('active', '==', true),
          limit(1)
        ));
      }

      if (!snap.empty) {
        const docId = snap.docs[0].id;
        const { id: _id, domain: _d, vercelDomain: _vd, active: _a, createdAt: _ts, ...rest } =
          snap.docs[0].data() as Record<string, unknown>;
        const config = {
          ...(rest as unknown as ClinicConfig),
          clinicId: docId,
          theme: normalizeTheme((rest as Partial<ClinicConfig>).theme),
        };
        applyTheme(config.theme);

        // Enforce subscription — block site if explicitly expired/cancelled,
        // OR if dates show the trial/subscription has ended (with 3-day grace period).
        // clinicRequiredGuard then redirects visitors to the platform landing page.
        const GRACE_DAYS = 3;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const isExplicitlyBlocked =
          config.subscriptionStatus === 'expired' ||
          config.subscriptionStatus === 'cancelled';

        const isTrialExpired = config.subscriptionStatus === 'trial' &&
          !!config.trialEndDate &&
          this.isPastWithGrace(config.trialEndDate, GRACE_DAYS);

        const isSubExpired = config.subscriptionStatus === 'active' &&
          !!config.subscriptionEndDate &&
          this.isPastWithGrace(config.subscriptionEndDate, GRACE_DAYS);

        if (isExplicitlyBlocked || isTrialExpired || isSubExpired) {
          return; // _isLoaded stays false → guard redirects to /business
        }

        this._config.set(config);
        this._isLoaded.set(true);
      }
    } catch (e) {
      console.error('[ClinicConfig] Firestore load failed — using static config:', e);
    }
  }

  /** Returns true if the ISO date string is more than graceDays in the past. */
  private isPastWithGrace(isoDate: string, graceDays: number): boolean {
    const end = new Date(isoDate);
    end.setDate(end.getDate() + graceDays);
    end.setHours(23, 59, 59, 999);
    return end < new Date();
  }

  /**
   * Load clinic config by the Firebase Auth UID of the clinic owner.
   * Used when the platform admin area loads at mydentalplatform.com (no hostname to match).
   * Returns true if a clinic was found and loaded.
   */
  async loadByUid(uid: string): Promise<boolean> {
    try {
      const snap = await getDocs(query(
        collection(db, 'clinics'),
        where('adminUid', '==', uid),
        where('active',   '==', true),
        limit(1),
      ));
      if (!snap.empty) {
        const docRef = snap.docs[0];
        const { domain: _d, vercelDomain: _vd, active: _a, createdAt: _ts, ...rest } =
          docRef.data() as Record<string, unknown>;
        const config = {
          ...(rest as unknown as ClinicConfig),
          clinicId: docRef.id,
          theme: normalizeTheme((rest as Partial<ClinicConfig>).theme),
        };
        applyTheme(config.theme);
        this._config.set(config);
        this._isLoaded.set(true);
        return true;
      }
    } catch (e) {
      console.error('[ClinicConfig] loadByUid failed:', e);
    }
    return false;
  }

  /**
   * Persist a single boolean onboarding flag to Firestore and update in-memory config.
   * Safe to call even before clinic is fully loaded — silently skips on 'default'.
   */
  async saveOnboardingFlag(field: 'onboardingDismissed' | 'onboardingSharedWebsite'): Promise<void> {
    const clinicId = this.config.clinicId;
    if (!clinicId || clinicId === 'default') return;
    try {
      await updateDoc(doc(db, 'clinics', clinicId), { [field]: true });
      this.updateConfig({ [field]: true });
    } catch (e) {
      console.error('[ClinicConfig] saveOnboardingFlag failed:', e);
    }
  }

  /** Merge partial fields into the in-memory config (does NOT write to Firestore). */
  updateConfig(partial: Partial<ClinicConfig>): void {
    const nextPartial = partial.theme
      ? { ...partial, theme: normalizeTheme(partial.theme) }
      : partial;
    this._config.update(c => ({ ...c, ...nextPartial }));
    if (nextPartial.theme) applyTheme(nextPartial.theme);
  }

  /** Full single-line address derived from the two address lines. */
  get address(): string {
    return `${this.config.addressLine1}, ${this.config.addressLine2}`;
  }

  /** Build a WhatsApp deep-link with the given message text. */
  whatsappUrl(message: string): string {
    return `https://wa.me/${this.config.whatsappNumber}?text=${encodeURIComponent(message)}`;
  }

  /** Generic booking link — used in footer, hero, contact CTA etc. */
  get bookingWhatsappUrl(): string {
    return this.whatsappUrl(
      `Hi ${this.config.name}! I would like to book an appointment. Please confirm an available slot.`
    );
  }

  /** Deep-link that opens the WhatsApp app directly on mobile (skips wa.me redirect). */
  get bookingWhatsappDeepLink(): string {
    const msg = encodeURIComponent(
      `Hi ${this.config.name}! I would like to book an appointment. Please confirm an available slot.`
    );
    return `whatsapp://send?phone=${this.config.whatsappNumber}&text=${msg}`;
  }

  /**
   * Returns true if the clinic is currently open based on `config.hours`.
   *
   * Each `ClinicHours` entry has a `days` string like "Mon – Fri" or "Sunday"
   * and a `time` string like "9:00 AM – 7:00 PM". We parse both to determine
   * whether the current day + time falls within any open window.
   *
   * Falls back to `true` when hours are not configured (don't show false info).
   */
  get isOpenNow(): boolean {
    const hours = this.config.hours;
    if (!hours.length) return true; // no hours data → don't show "Closed"

    const now    = new Date();
    const today  = now.getDay(); // 0 = Sun, 1 = Mon … 6 = Sat
    const nowMin = now.getHours() * 60 + now.getMinutes();

    const DAY_MAP: Record<string, number> = {
      sun: 0, sunday: 0,
      mon: 1, monday: 1,
      tue: 2, tuesday: 2,
      wed: 3, wednesday: 3,
      thu: 4, thursday: 4,
      fri: 5, friday: 5,
      sat: 6, saturday: 6,
    };

    /** Parse "9:00 AM" or "9 AM" → minutes since midnight */
    function parseTime(t: string): number {
      const m = /(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i.exec(t.trim());
      if (!m) return -1;
      let h = parseInt(m[1], 10);
      const min = m[2] ? parseInt(m[2], 10) : 0;
      const isPm = m[3].toUpperCase() === 'PM';
      if (isPm && h !== 12) h += 12;
      if (!isPm && h === 12) h = 0;
      return h * 60 + min;
    }

    /** Resolve a day name abbreviation → day index (0–6) */
    function dayIndex(name: string): number {
      return DAY_MAP[name.toLowerCase().slice(0, 3)] ?? -1;
    }

    for (const slot of hours) {
      // ── Determine day range ────────────────────────────────────────────────
      // "days" is e.g. "Mon – Sat", "Monday – Saturday", "Sunday", "Mon, Wed, Fri"
      const daysPart = slot.days.replace(/–|-/g, '-');
      let coversToday = false;

      if (daysPart.includes('-')) {
        // Range: "Mon - Sat"
        const [from, to] = daysPart.split('-').map(s => dayIndex(s.trim()));
        if (from !== -1 && to !== -1) {
          coversToday = from <= to
            ? today >= from && today <= to
            : today >= from || today <= to; // wraps past Sat (e.g. Sat - Mon)
        }
      } else if (daysPart.includes(',')) {
        // List: "Mon, Wed, Fri"
        coversToday = daysPart.split(',').some(d => dayIndex(d.trim()) === today);
      } else {
        // Single day
        coversToday = dayIndex(daysPart.trim()) === today;
      }

      if (!coversToday) continue;

      // ── Determine time range ───────────────────────────────────────────────
      // "time" is e.g. "9:00 AM – 7:00 PM" or "10 AM - 2 PM"
      const timePart = slot.time.replace(/–/g, '-');
      const timeSplit = timePart.split('-');
      if (timeSplit.length < 2) continue;

      // handle "10 AM - 2 PM" where AM/PM may not repeat on the open side
      const openStr  = timeSplit[0].trim();
      const closeStr = timeSplit.slice(1).join('-').trim();
      const openMin  = parseTime(openStr);
      const closeMin = parseTime(closeStr);

      if (openMin === -1 || closeMin === -1) continue;
      if (nowMin >= openMin && nowMin < closeMin) return true;
    }

    return false;
  }
}
