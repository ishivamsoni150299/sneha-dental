import { Injectable } from '@angular/core';
import {
  collection, getDocs, getDoc, addDoc, updateDoc,
  deleteDoc, doc, query, orderBy, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

export type LeadStatus = 'new' | 'contacted' | 'interested' | 'demo' | 'converted' | 'lost';
export type LeadSource = 'google_maps' | 'instagram' | 'referral' | 'ida' | 'walkin' | 'other';
export type ActivityType = 'whatsapp' | 'called' | 'note' | 'status_change';

export interface StoredLead {
  id:           string;
  clinicName:   string;
  doctorName:   string;
  phone:        string;
  city:         string;
  source:       LeadSource;
  status:       LeadStatus;
  followUpDate?: string;
  notes?:       string;
  referredBy?:  string;
  // Enriched from Google Maps CSV
  address?:     string;   // Full address from Google Maps
  area?:        string;   // Area / Neighbourhood
  rating?:      number;   // Google star rating (0–5)
  reviewCount?: number;   // Total review count
  categories?:  string;   // Clinic type (e.g. "Dental clinic, Dentist")
  mapsLink?:    string;   // Direct Google Maps URL (used as dedup key)
  createdAt?:   Timestamp;
}

export interface LeadActivity {
  id:        string;
  type:      ActivityType;
  note:      string;
  createdAt: Timestamp;
}

@Injectable({ providedIn: 'root' })
export class LeadFirestoreService {
  private readonly COL = 'leads';

  async getAll(): Promise<StoredLead[]> {
    const q    = query(collection(db, this.COL), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as StoredLead));
  }

  async getById(id: string): Promise<StoredLead | null> {
    const snap = await getDoc(doc(db, this.COL, id));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as StoredLead) : null;
  }

  async create(data: Omit<StoredLead, 'id' | 'createdAt'>): Promise<string> {
    // Firestore rejects undefined values — strip them before writing
    const payload = Object.fromEntries(
      Object.entries({ ...data, createdAt: serverTimestamp() }).filter(([, v]) => v !== undefined)
    );
    const ref = await addDoc(collection(db, this.COL), payload);
    return ref.id;
  }

  async update(id: string, data: Partial<Omit<StoredLead, 'id' | 'createdAt'>>): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await updateDoc(doc(db, this.COL, id), data as any);
  }

  async remove(id: string): Promise<void> {
    await deleteDoc(doc(db, this.COL, id));
  }

  // ── Activities subcollection ───────────────────────────────────────────────
  async getActivities(leadId: string): Promise<LeadActivity[]> {
    const q    = query(collection(db, this.COL, leadId, 'activities'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as LeadActivity));
  }

  async addActivity(leadId: string, data: Omit<LeadActivity, 'id' | 'createdAt'>): Promise<void> {
    await addDoc(collection(db, this.COL, leadId, 'activities'), {
      ...data,
      createdAt: serverTimestamp(),
    });
  }
}
