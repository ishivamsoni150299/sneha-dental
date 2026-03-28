import { Injectable, signal } from '@angular/core';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, limit } from 'firebase/firestore';
import { clinicConfig, ClinicConfig } from '../config/clinic.config';
import { environment } from '../../../environments/environment';

const app = getApps().length ? getApps()[0] : initializeApp(environment.firebase);
const db  = getFirestore(app);

@Injectable({ providedIn: 'root' })
export class ClinicConfigService {
  private readonly _config = signal<ClinicConfig>(clinicConfig);

  /** Current clinic config — synchronous, always has a value (static fallback until Firestore loads). */
  get config(): ClinicConfig { return this._config(); }

  /**
   * Called once by APP_INITIALIZER before the app renders.
   * Loads the matching clinic config from Firestore based on the current hostname.
   * On localhost, skips Firestore and uses the static fallback.
   * Never throws — falls back to static config on any error.
   */
  async loadFromFirestore(): Promise<void> {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return;
    try {
      const q = query(
        collection(db, 'clinics'),
        where('domain', '==', host),
        where('active', '==', true),
        limit(1)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const { id: _id, domain: _domain, active: _active, createdAt: _ts, ...rest } =
          snap.docs[0].data() as Record<string, unknown>;
        this._config.set(rest as unknown as ClinicConfig);
      }
    } catch (e) {
      console.error('[ClinicConfig] Firestore load failed — using static config:', e);
    }
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
