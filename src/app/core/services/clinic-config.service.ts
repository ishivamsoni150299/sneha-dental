import { Injectable, signal } from '@angular/core';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, limit } from 'firebase/firestore';
import { clinicConfig, ClinicConfig } from '../config/clinic.config';
export type { ClinicConfig };
import { environment } from '../../../environments/environment';

const app = getApps().length ? getApps()[0] : initializeApp(environment.firebase);
const db  = getFirestore(app);

// ── Premium theme palettes ────────────────────────────────────────────────────
// Each palette maps CSS variable names → hex/rgba values.
// Applied to document.documentElement so the entire clinic site picks them up.
const THEME_PALETTES: Record<string, Record<string, string>> = {
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
    '--accent':    '#4338CA',
    '--accent-dk': '#3730A3',
    '--accent-md': '#6366F1',
    '--accent-lt': '#EEF2FF',
    '--accent-bd': '#A5B4FC',
    '--accent-sh': 'rgba(67, 56, 202, 0.20)',
  },
  rose: {
    '--accent':    '#BE123C',
    '--accent-dk': '#9F1239',
    '--accent-md': '#E11D48',
    '--accent-lt': '#FFF1F2',
    '--accent-bd': '#FDA4AF',
    '--accent-sh': 'rgba(190, 18, 60, 0.20)',
  },
  caramel: {
    '--accent':    '#B45309',
    '--accent-dk': '#92400E',
    '--accent-md': '#D97706',
    '--accent-lt': '#FFFBEB',
    '--accent-bd': '#FCD34D',
    '--accent-sh': 'rgba(180, 83, 9, 0.20)',
  },
};

function applyTheme(theme: string | undefined) {
  const palette = THEME_PALETTES[theme ?? 'blue'] ?? THEME_PALETTES['blue'];
  const root = document.documentElement;
  Object.entries(palette).forEach(([prop, val]) => root.style.setProperty(prop, val));
}

@Injectable({ providedIn: 'root' })
export class ClinicConfigService {
  private readonly _config   = signal<ClinicConfig>(clinicConfig);
  private readonly _isLoaded = signal<boolean>(false);

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
        const config = { ...(rest as unknown as ClinicConfig), clinicId: docId };
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
        const config = { ...(rest as unknown as ClinicConfig), clinicId: docRef.id };
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

  /** Merge partial fields into the in-memory config (does NOT write to Firestore). */
  updateConfig(partial: Partial<ClinicConfig>): void {
    this._config.update(c => ({ ...c, ...partial }));
    if (partial.theme) applyTheme(partial.theme);
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
}
