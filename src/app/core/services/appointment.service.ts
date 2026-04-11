import { Injectable, inject } from '@angular/core';
import { ClinicConfigService } from './clinic-config.service';
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
  clinicId: string;      // scopes this appointment to its clinic
  bookingRef: string;
  name: string;
  phone: string;
  email?: string;
  service: string;
  date: string;          // "YYYY-MM-DD"
  time: string;
  message?: string;
  status: 'pending' | 'confirmed' | 'checked_in' | 'completed' | 'no_show' | 'cancelled';
  createdAt?: Timestamp;
}

const firebaseApp = getApps().length ? getApps()[0] : initializeApp(environment.firebase);
const db = getFirestore(firebaseApp);

@Injectable({ providedIn: 'root' })
export class AppointmentService {
  private readonly clinic = inject(ClinicConfigService);
  private readonly COLLECTION = 'appointments';

  private get clinicId(): string {
    return this.clinic.config.clinicId ?? this.clinic.config.bookingRefPrefix;
  }

  private get prefix(): string {
    return this.clinic.config.bookingRefPrefix;
  }

  private generateBookingRef(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let suffix = '';
    for (let i = 0; i < 8; i++) {
      suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `${this.prefix}-${suffix}`;
  }

  /** True if appointment date is more than 24 hours from now. */
  canCancel(date: string): boolean {
    const appointmentDate = new Date(date);
    const diffHours = (appointmentDate.getTime() - Date.now()) / (1000 * 60 * 60);
    return diffHours > 24;
  }

  /** Save a new appointment and return the booking reference. */
  async bookAppointment(
    data: Omit<Appointment, 'id' | 'clinicId' | 'bookingRef' | 'status' | 'createdAt'>
  ): Promise<string> {
    const bookingRef = this.generateBookingRef();
    await addDoc(collection(db, this.COLLECTION), {
      ...data,
      clinicId: this.clinicId,
      bookingRef,
      status: 'pending',
      createdAt: serverTimestamp(),
    });
    return bookingRef;
  }

  /** Fetch appointment by bookingRef + phone — scoped to this clinic. */
  async getAppointmentByRef(bookingRef: string, phone: string): Promise<Appointment | null> {
    const q = query(
      collection(db, this.COLLECTION),
      where('clinicId', '==', this.clinicId),
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

  /** Fetch all appointments for this clinic, ordered by date desc (admin only). */
  async getAllAppointments(): Promise<Appointment[]> {
    const q = query(
      collection(db, this.COLLECTION),
      where('clinicId', '==', this.clinicId),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Appointment));
  }

  /** Set status directly (admin use). */
  async setStatus(id: string, status: 'confirmed' | 'checked_in' | 'completed' | 'no_show' | 'cancelled'): Promise<void> {
    await updateDoc(doc(db, this.COLLECTION, id), { status });
  }

  /** Cancel (delete) appointment — enforces 24-hour rule. */
  async cancelAppointment(id: string, date: string): Promise<void> {
    if (!this.canCancel(date)) {
      throw new Error(
        `Cannot cancel within 24 hours of your appointment. Please call ${this.clinic.config.phone}.`
      );
    }
    await deleteDoc(doc(db, this.COLLECTION, id));
  }
}
