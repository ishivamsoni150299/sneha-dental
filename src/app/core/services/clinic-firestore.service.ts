import { Injectable } from '@angular/core';
import {
  collection, getDocs, getDoc, setDoc, updateDoc,
  deleteDoc, deleteField, doc, query, orderBy, where, serverTimestamp, writeBatch,
  type Timestamp, type UpdateData, type DocumentData, limit,
} from 'firebase/firestore';
import type { ClinicConfig, ClinicHours, ClinicService, Testimonial } from '../config/clinic.config';
import { db } from '../firebase';

// ── Whitelist of fields a clinic owner can self-edit ─────────────────────────
// Billing, subscription, domain, active, admin ownership, and AI provider config
// are intentionally excluded. Keep this in sync with firestore.rules.
export interface ClinicSettingsPayload {
  name?:                string;
  doctorName?:          string;
  doctorQualification?: string;
  patientCount?:        string;
  doctorBio?:           string[];
  phone?:               string;
  phoneE164?:           string;
  whatsappNumber?:      string;
  addressLine1?:        string;
  addressLine2?:        string;
  city?:                string;
  mapEmbedUrl?:         string;
  mapDirectionsUrl?:    string;
  hours?:               ClinicHours[];
  services?:            ClinicService[];
  testimonials?:        Testimonial[];
  social?:              { facebook?: string; instagram?: string; linkedin?: string };
  theme?:               'blue' | 'teal' | 'caramel' | 'emerald' | 'purple' | 'rose';
  logoDataUrl?:         string | null;   // null = remove logo
  onboardingDismissed?: boolean;
  onboardingSharedWebsite?: boolean;
}

const CLINIC_SETTINGS_ALLOWED_KEYS = new Set<keyof ClinicSettingsPayload>([
  'name',
  'doctorName',
  'doctorQualification',
  'patientCount',
  'doctorBio',
  'phone',
  'phoneE164',
  'whatsappNumber',
  'addressLine1',
  'addressLine2',
  'city',
  'mapEmbedUrl',
  'mapDirectionsUrl',
  'hours',
  'services',
  'testimonials',
  'social',
  'theme',
  'logoDataUrl',
  'onboardingDismissed',
  'onboardingSharedWebsite',
]);

export interface PlatformCosts {
  vercel:   number;
  firebase: number;
  domain:   number;
  other:    number;
}

export interface AppointmentDoc {
  id:         string;
  clinicId:   string;
  bookingRef: string;
  name:       string;
  phone:      string;
  service:    string;
  date:       string;
  time:       string;
  status:     'pending' | 'confirmed' | 'cancelled';
  createdAt?: Timestamp;
}

export interface StoredClinic extends ClinicConfig {
  id:         string;
  domain:     string;
  active:     boolean;
  adminUid?:  string;
  adminEmail?: string;
  createdAt?: Timestamp;
}

/** Firestore updateDoc requires a plain-object map — strip undefined values. */
function toFirestoreData(data: Record<string, unknown>): UpdateData<DocumentData> {
  return Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== undefined),
  ) as UpdateData<DocumentData>;
}

const PRIVATE_CLINIC_FIELDS = new Set([
  'adminUid',
  'adminEmail',
  'billingEmail',
  'billingNotes',
  'billingCycle',
  'lastPaymentDate',
  'lastPaymentAmount',
  'lastPaymentRef',
  'razorpaySubscriptionId',
  'leadSource',
  'marketingAttribution',
  'grandfatheredUntil',
  'grandfatheredPlan',
  'voiceBudgetCap',
  'voiceAutoStop',
]);

function partitionClinicData(data: Record<string, unknown>): {
  publicData: Record<string, unknown>;
  privateData: Record<string, unknown>;
} {
  const publicData: Record<string, unknown> = {};
  const privateData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    (PRIVATE_CLINIC_FIELDS.has(key) ? privateData : publicData)[key] = value;
  }
  return { publicData, privateData };
}

@Injectable({ providedIn: 'root' })
export class ClinicFirestoreService {
  private readonly COL = 'clinics';

  private async mergePrivate(id: string, publicData: Record<string, unknown>): Promise<StoredClinic> {
    try {
      const privateSnap = await getDoc(doc(db, this.COL, id, 'private', 'account'));
      return {
        id,
        ...publicData,
        ...(privateSnap.exists() ? privateSnap.data() : {}),
      } as StoredClinic;
    } catch {
      return { id, ...publicData } as StoredClinic;
    }
  }

  async getAll(): Promise<StoredClinic[]> {
    const q    = query(collection(db, this.COL), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return Promise.all(snap.docs.map(d => this.mergePrivate(d.id, d.data())));
  }

  async getById(id: string): Promise<StoredClinic | null> {
    const snap = await getDoc(doc(db, this.COL, id));
    return snap.exists() ? this.mergePrivate(snap.id, snap.data()) : null;
  }

  async getActive(): Promise<StoredClinic[]> {
    const q    = query(collection(db, this.COL), where('active', '==', true), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return Promise.all(snap.docs.map(d => this.mergePrivate(d.id, d.data())));
  }

  async getByDomain(domain: string): Promise<StoredClinic | null> {
    const q    = query(
      collection(db, this.COL),
      where('domain', '==', domain),
      where('active', '==', true),
      limit(1),
    );
    const snap = await getDocs(q);
    return snap.empty ? null : this.mergePrivate(snap.docs[0].id, snap.docs[0].data());
  }

  async getByVercelDomain(vercelDomain: string): Promise<StoredClinic | null> {
    const q = query(
      collection(db, this.COL),
      where('vercelDomain', '==', vercelDomain),
      limit(1),
    );
    const snap = await getDocs(q);
    return snap.empty ? null : this.mergePrivate(snap.docs[0].id, snap.docs[0].data());
  }

  async getByAdminUid(uid: string): Promise<StoredClinic | null> {
    const q = query(
      collection(db, this.COL),
      where('adminUid', '==', uid),
      limit(1),
    );
    const snap = await getDocs(q);
    if (!snap.empty) return this.mergePrivate(snap.docs[0].id, snap.docs[0].data());

    const clinics = await this.getAll();
    return clinics.find(clinic => clinic.adminUid === uid) ?? null;
  }

  async getActiveSubscriptions(): Promise<StoredClinic[]> {
    const q    = query(collection(db, this.COL), where('subscriptionStatus', '==', 'active'));
    const snap = await getDocs(q);
    return Promise.all(snap.docs.map(d => this.mergePrivate(d.id, d.data())));
  }

  async getExpiredTrials(): Promise<StoredClinic[]> {
    const today = new Date().toISOString().split('T')[0];
    const q     = query(
      collection(db, this.COL),
      where('subscriptionStatus', '==', 'trial'),
      where('trialEndDate', '<', today),
    );
    const snap = await getDocs(q);
    return Promise.all(snap.docs.map(d => this.mergePrivate(d.id, d.data())));
  }

  async create(data: Omit<StoredClinic, 'id' | 'createdAt'>): Promise<string> {
    const ref = doc(collection(db, this.COL));
    const { publicData, privateData } = partitionClinicData(data as unknown as Record<string, unknown>);
    const batch = writeBatch(db);
    batch.set(ref, { ...toFirestoreData(publicData), clinicId: ref.id, createdAt: serverTimestamp() });
    if (Object.keys(privateData).length > 0) {
      batch.set(doc(ref, 'private', 'account'), {
        ...toFirestoreData(privateData),
        updatedAt: serverTimestamp(),
      }, { merge: true });
    }
    await batch.commit();
    return ref.id;
  }

  async update(id: string, data: Partial<Omit<StoredClinic, 'id' | 'createdAt'>>): Promise<void> {
    const clinicRef = doc(db, this.COL, id);
    const existing = await getDoc(clinicRef);
    if (!existing.exists()) throw new Error('Clinic not found');

    const incoming = data as unknown as Record<string, unknown>;
    const { publicData, privateData } = partitionClinicData(incoming);
    const { privateData: legacyPrivateData } = partitionClinicData(existing.data());
    const privatePatch = { ...legacyPrivateData, ...privateData };
    const fieldsToRemove = Object.fromEntries(
      [...PRIVATE_CLINIC_FIELDS]
        .filter(key => key in existing.data() || key in incoming)
        .map(key => [key, deleteField()]),
    );

    const batch = writeBatch(db);
    const publicPatch = { ...toFirestoreData(publicData), ...fieldsToRemove };
    if (Object.keys(publicPatch).length > 0) batch.update(clinicRef, publicPatch);
    if (Object.keys(privatePatch).length > 0) {
      batch.set(doc(clinicRef, 'private', 'account'), {
        ...toFirestoreData(privatePatch),
        updatedAt: serverTimestamp(),
      }, { merge: true });
    }
    await batch.commit();
  }

  async remove(id: string): Promise<void> {
    await deleteDoc(doc(db, this.COL, id));
  }

  // ── Cross-clinic appointments (super admin only) ──────────────────────────
  async getAllAppointments(): Promise<AppointmentDoc[]> {
    const q    = query(collection(db, 'appointments'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as AppointmentDoc));
  }

  // ── Platform settings (costs, etc.) ───────────────────────────────────────
  async getPlatformSettings(): Promise<PlatformCosts> {
    const snap = await getDoc(doc(db, 'platform', 'settings'));
    if (!snap.exists()) return { vercel: 0, firebase: 0, domain: 0, other: 0 };
    const raw = snap.data() as { monthlyCosts?: Partial<PlatformCosts> };
    return {
      vercel:   raw.monthlyCosts?.vercel   ?? 0,
      firebase: raw.monthlyCosts?.firebase ?? 0,
      domain:   raw.monthlyCosts?.domain   ?? 0,
      other:    raw.monthlyCosts?.other    ?? 0,
    };
  }

  async savePlatformSettings(costs: PlatformCosts): Promise<void> {
    await setDoc(doc(db, 'platform', 'settings'), { monthlyCosts: costs });
  }

  // ── Clinic self-service (whitelist-enforced) ───────────────────────────────
  async updateClinicSettings(id: string, data: ClinicSettingsPayload): Promise<void> {
    if (!id || id === 'default') throw new Error('Invalid clinic ID');
    const safeData = Object.fromEntries(
      Object.entries(data).filter(([key]) => CLINIC_SETTINGS_ALLOWED_KEYS.has(key as keyof ClinicSettingsPayload)),
    ) as Record<string, unknown>;
    if (Object.keys(safeData).length === 0) {
      throw new Error('No clinic settings fields to update');
    }

    await updateDoc(
      doc(db, this.COL, id),
      toFirestoreData(safeData),
    );
  }
}
