import { Injectable } from '@angular/core';
import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  orderBy,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { environment } from '../../../environments/environment';

export interface Appointment {
  id?: string;
  bookingRef: string;
  name: string;
  phone: string;
  email?: string;
  service: string;
  date: string;       // "YYYY-MM-DD"
  time: string;
  message?: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  createdAt?: Timestamp;
}

// Initialize Firebase once (guard prevents duplicate init)
const firebaseApp = getApps().length
  ? getApps()[0]
  : initializeApp(environment.firebase);
const db = getFirestore(firebaseApp);

@Injectable({ providedIn: 'root' })
export class AppointmentService {

  private readonly COLLECTION = 'appointments';

  private generateBookingRef(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let suffix = '';
    for (let i = 0; i < 8; i++) {
      suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `SD-${suffix}`;
  }

  /** True if appointment date is more than 24 hours from now. */
  canCancel(date: string): boolean {
    const appointmentDate = new Date(date);
    const diffHours = (appointmentDate.getTime() - Date.now()) / (1000 * 60 * 60);
    return diffHours > 24;
  }

  /** Save a new appointment and return the booking reference. */
  async bookAppointment(
    data: Omit<Appointment, 'id' | 'bookingRef' | 'status' | 'createdAt'>
  ): Promise<string> {
    const bookingRef = this.generateBookingRef();
    await addDoc(collection(db, this.COLLECTION), {
      ...data,
      bookingRef,
      status: 'pending',
      createdAt: serverTimestamp(),
    });
    return bookingRef;
  }

  /** Fetch appointment by bookingRef + phone (acts as ownership check without auth). */
  async getAppointmentByRef(bookingRef: string, phone: string): Promise<Appointment | null> {
    const q = query(
      collection(db, this.COLLECTION),
      where('bookingRef', '==', bookingRef),
      where('phone', '==', phone)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    const snap = snapshot.docs[0];
    return { id: snap.id, ...snap.data() } as Appointment;
  }

  /** Update editable fields: service, date, time, message. */
  async updateAppointment(
    id: string,
    data: Partial<Pick<Appointment, 'service' | 'date' | 'time' | 'message'>>
  ): Promise<void> {
    await updateDoc(doc(db, this.COLLECTION, id), { ...data });
  }

  /** Fetch all appointments ordered by date desc (admin only). */
  async getAllAppointments(): Promise<Appointment[]> {
    const q = query(collection(db, this.COLLECTION), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Appointment));
  }

  /** Set status directly (admin use: confirm or cancel without 24hr restriction). */
  async setStatus(id: string, status: 'confirmed' | 'cancelled'): Promise<void> {
    await updateDoc(doc(db, this.COLLECTION, id), { status });
  }

  /** Cancel (delete) appointment — enforces 24-hour rule. */
  async cancelAppointment(id: string, date: string): Promise<void> {
    if (!this.canCancel(date)) {
      throw new Error(
        'Cannot cancel within 24 hours of your appointment. Please call +91 91402 10648.'
      );
    }
    await deleteDoc(doc(db, this.COLLECTION, id));
  }
}
