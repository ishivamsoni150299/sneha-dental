import { Injectable } from '@angular/core';
import {
  collection, getDocs, getDoc, setDoc, addDoc, updateDoc,
  deleteDoc, doc, query, orderBy, where, serverTimestamp,
  type Timestamp, type UpdateData, type DocumentData, limit,
} from 'firebase/firestore';
import type { ClinicConfig, ClinicHours, Testimonial } from '../config/clinic.config';
import { db } from '../firebase';

// ── Whitelist of fields a clinic owner can self-edit ─────────────────────────
// Billing, subscription, domain, active, and theme are intentionally excluded.
export interface ClinicSettingsPayload {
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
  testimonials?:        Testimonial[];
  social?:              { facebook?: string; instagram?: string; linkedin?: string };
  theme?:               'blue' | 'teal' | 'caramel' | 'emerald' | 'purple' | 'rose';
  logoDataUrl?:         string | null;   // null = remove logo
  comingSoon?:          boolean;
  launchDate?:          string;
}

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

@Injectable({ providedIn: 'root' })
export class ClinicFirestoreService {
  private readonly COL = 'clinics';

  async getAll(): Promise<StoredClinic[]> {
    const q    = query(collection(db, this.COL), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as StoredClinic));
  }

  async getById(id: string): Promise<StoredClinic | null> {
    const snap = await getDoc(doc(db, this.COL, id));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as StoredClinic) : null;
  }

  async getActive(): Promise<StoredClinic[]> {
    const q    = query(collection(db, this.COL), where('active', '==', true), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as StoredClinic));
  }

  async getByDomain(domain: string): Promise<StoredClinic | null> {
    const q    = query(
      collection(db, this.COL),
      where('domain', '==', domain),
      where('active', '==', true),
      limit(1),
    );
    const snap = await getDocs(q);
    return snap.empty ? null : ({ id: snap.docs[0].id, ...snap.docs[0].data() } as StoredClinic);
  }

  async getByAdminUid(uid: string): Promise<StoredClinic | null> {
    const q = query(
      collection(db, this.COL),
      where('adminUid', '==', uid),
      limit(1),
    );
    const snap = await getDocs(q);
    return snap.empty ? null : ({ id: snap.docs[0].id, ...snap.docs[0].data() } as StoredClinic);
  }

  async getActiveSubscriptions(): Promise<StoredClinic[]> {
    const q    = query(collection(db, this.COL), where('subscriptionStatus', '==', 'active'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as StoredClinic));
  }

  async getExpiredTrials(): Promise<StoredClinic[]> {
    const today = new Date().toISOString().split('T')[0];
    const q     = query(
      collection(db, this.COL),
      where('subscriptionStatus', '==', 'trial'),
      where('trialEndDate', '<', today),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as StoredClinic));
  }

  async create(data: Omit<StoredClinic, 'id' | 'createdAt'>): Promise<string> {
    const ref = await addDoc(
      collection(db, this.COL),
      { ...toFirestoreData(data as unknown as Record<string, unknown>), createdAt: serverTimestamp() },
    );
    await updateDoc(ref, { clinicId: ref.id });
    return ref.id;
  }

  async update(id: string, data: Partial<Omit<StoredClinic, 'id' | 'createdAt'>>): Promise<void> {
    await updateDoc(
      doc(db, this.COL, id),
      toFirestoreData(data as unknown as Record<string, unknown>),
    );
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
    await updateDoc(
      doc(db, this.COL, id),
      toFirestoreData(data as unknown as Record<string, unknown>),
    );
  }
}
