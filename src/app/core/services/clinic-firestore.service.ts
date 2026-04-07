import { Injectable } from '@angular/core';
import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore, collection, getDocs, getDoc, setDoc, addDoc, updateDoc,
  deleteDoc, doc, query, orderBy, where, serverTimestamp, Timestamp, limit,
} from 'firebase/firestore';
import { ClinicConfig } from '../config/clinic.config';
import { environment } from '../../../environments/environment';

const app = getApps().length ? getApps()[0] : initializeApp(environment.firebase);
const db  = getFirestore(app);

export interface StoredClinic extends ClinicConfig {
  id:         string;
  domain:     string;
  active:     boolean;
  createdAt?: Timestamp;
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
    const q    = query(collection(db, this.COL), where('domain', '==', domain), where('active', '==', true), limit(1));
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
    const ref = await addDoc(collection(db, this.COL), { ...data, createdAt: serverTimestamp() });
    return ref.id;
  }

  async update(id: string, data: Partial<Omit<StoredClinic, 'id' | 'createdAt'>>): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await updateDoc(doc(db, this.COL, id), data as any);
  }

  async remove(id: string): Promise<void> {
    await deleteDoc(doc(db, this.COL, id));
  }

  // ── Platform settings (costs, etc.) ───────────────────────────────────────
  async getPlatformSettings(): Promise<{ vercel: number; firebase: number; domain: number; other: number }> {
    const snap = await getDoc(doc(db, 'platform', 'settings'));
    const data = snap.exists() ? (snap.data() as Record<string, unknown>)['monthlyCosts'] as Record<string, number> : {};
    return { vercel: 0, firebase: 0, domain: 0, other: 0, ...data };
  }

  async savePlatformSettings(costs: { vercel: number; firebase: number; domain: number; other: number }): Promise<void> {
    await setDoc(doc(db, 'platform', 'settings'), { monthlyCosts: costs });
  }
}
