import { Injectable, inject, NgZone } from '@angular/core';
import { ClinicConfigService } from './clinic-config.service';
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  orderBy,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';

export type PaymentStatus = 'paid' | 'unpaid' | 'partial';
export type PaymentMethod = 'cash' | 'upi' | 'card' | 'insurance' | 'other';

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
  doctorId?: string;     // optional — set when patient picks a specific doctor
  doctorName?: string;   // denormalized for display without extra lookup
  message?: string;
  status: 'pending' | 'confirmed' | 'checked_in' | 'completed' | 'no_show' | 'cancelled';
  // Clinical record (filled by clinic after the visit)
  clinicNotes?:    string;
  treatmentDone?:  string;
  amountCharged?:  number;
  paymentStatus?:  PaymentStatus;
  paymentMethod?:  PaymentMethod;
  createdAt?: Timestamp;
}

@Injectable({ providedIn: 'root' })
export class AppointmentService {
  private readonly clinic = inject(ClinicConfigService);
  private readonly zone   = inject(NgZone);
  private readonly COLLECTION = 'appointments';

  private get clinicId(): string {
    return this.clinic.config.clinicId ?? this.clinic.config.bookingRefPrefix;
  }

  private get prefix(): string {
    return this.clinic.config.bookingRefPrefix;
  }

  private generateBookingRef(): string {
    const chars  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const random = crypto.getRandomValues(new Uint8Array(8));
    const suffix = Array.from(random, b => chars[b % chars.length]).join('');
    return `${this.prefix}-${suffix}`;
  }

  /** True if appointment date is more than 24 hours from now. */
  canCancel(date: string): boolean {
    const diffHours = (new Date(date).getTime() - Date.now()) / (1000 * 60 * 60);
    return diffHours > 24;
  }

  /**
   * Save a new appointment with atomic slot reservation.
   *
   * Uses a Firestore transaction to atomically:
   *   1. Check the slot document doesn't already exist (prevents double-booking)
   *   2. Create the slot reservation document
   *   3. Create the appointment document
   *
   * If two patients submit simultaneously for the same clinic/doctor/date/time,
   * only one transaction succeeds — the other gets a "slot taken" error.
   *
   * Slot documents live in the `slots` collection with ID:
   *   `{clinicId}_{doctorId|any}_{date}_{time}` (normalised, no spaces)
   */
  async bookAppointment(
    data: Omit<Appointment, 'id' | 'clinicId' | 'bookingRef' | 'status' | 'createdAt'>
  ): Promise<string> {
    const bookingRef = this.generateBookingRef();
    const clinicId   = this.clinicId;

    // Build a deterministic slot ID — normalise time to avoid space issues
    const slotKey  = `${clinicId}_${data.doctorId ?? 'any'}_${data.date}_${data.time.replace(/[:\s]/g, '')}`;
    const slotRef  = doc(db, 'slots', slotKey);
    const apptRef  = doc(collection(db, this.COLLECTION));

    await runTransaction(db, async (tx) => {
      const slotSnap = await tx.get(slotRef);
      if (slotSnap.exists()) {
        throw new Error('This time slot has just been taken. Please choose another time.');
      }

      // Reserve the slot
      tx.set(slotRef, {
        clinicId,
        doctorId:    data.doctorId ?? null,
        date:        data.date,
        time:        data.time,
        appointmentId: apptRef.id,
        createdAt:   serverTimestamp(),
      });

      // Create the appointment
      tx.set(apptRef, {
        ...data,
        clinicId,
        bookingRef,
        status:    'pending',
        createdAt: serverTimestamp(),
      });
    });

    return bookingRef;
  }

  /** Fetch appointment by bookingRef + phone — scoped to this clinic. */
  async getAppointmentByRef(bookingRef: string, phone: string): Promise<Appointment | null> {
    const q        = query(
      collection(db, this.COLLECTION),
      where('clinicId',   '==', this.clinicId),
      where('bookingRef', '==', bookingRef),
      where('phone',      '==', phone),
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

  /**
   * Subscribe to real-time appointment updates for this clinic.
   *
   * Calls `onNext` whenever Firestore pushes a change (new booking,
   * status update, etc.). Returns an `Unsubscribe` function — call it
   * in `ngOnDestroy` to stop listening and prevent memory leaks.
   *
   * Runs the callback inside `NgZone.run()` so Angular's OnPush
   * change detection picks up every update automatically.
   */
  subscribeToAppointments(
    onNext: (appointments: Appointment[]) => void,
    onError?: (err: Error) => void,
  ): Unsubscribe {
    const q = query(
      collection(db, this.COLLECTION),
      where('clinicId', '==', this.clinicId),
      orderBy('createdAt', 'desc'),
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const appointments = snapshot.docs.map(
          d => ({ id: d.id, ...d.data() } as Appointment),
        );
        // Re-enter Angular zone so OnPush components update
        this.zone.run(() => onNext(appointments));
      },
      (err) => {
        console.error('[AppointmentService] onSnapshot error:', err);
        this.zone.run(() => onError?.(err));
      },
    );
  }

  /**
   * One-shot fetch — kept for contexts that don't need real-time
   * (e.g. super-admin cross-clinic views, CSV export).
   */
  async getAllAppointments(): Promise<Appointment[]> {
    const q        = query(
      collection(db, this.COLLECTION),
      where('clinicId', '==', this.clinicId),
      orderBy('createdAt', 'desc'),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Appointment));
  }

  /** Set status directly (admin use). */
  async setStatus(
    id: string,
    status: 'confirmed' | 'checked_in' | 'completed' | 'no_show' | 'cancelled',
  ): Promise<void> {
    await updateDoc(doc(db, this.COLLECTION, id), { status });
  }

  /** Save clinical record fields (notes, treatment, payment). Strips undefined. */
  async updateClinicalDetails(
    id: string,
    data: Partial<Pick<Appointment, 'clinicNotes' | 'treatmentDone' | 'amountCharged' | 'paymentStatus' | 'paymentMethod'>>,
  ): Promise<void> {
    const payload = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== undefined && v !== '' && v !== null),
    );
    if (Object.keys(payload).length) {
      await updateDoc(doc(db, this.COLLECTION, id), payload);
    }
  }

  /** Cancel appointment — enforces 24-hour rule. */
  async cancelAppointment(id: string, date: string): Promise<void> {
    if (!this.canCancel(date)) {
      throw new Error(
        `Cannot cancel within 24 hours of your appointment. Please call ${this.clinic.config.phone}.`,
      );
    }
    await deleteDoc(doc(db, this.COLLECTION, id));
  }
}
