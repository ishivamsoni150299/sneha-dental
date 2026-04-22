import { Injectable, inject, NgZone } from '@angular/core';
import { ClinicConfigService } from './clinic-config.service';
import { normalizeTimeValue } from './doctor.service';
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  orderBy,
  doc,
  updateDoc,
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
  lookupKey?: string;    // deterministic ID used for public self-service lookup
  bookingRef: string;
  name: string;
  phone: string;
  email?: string;
  service: string;
  date: string;          // "YYYY-MM-DD"
  time: string;
  doctorId?: string | null;     // optional — set when patient picks a specific doctor
  doctorName?: string | null;   // denormalized for display without extra lookup
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

  private stripUndefined<T extends Record<string, unknown>>(data: T): Partial<T> {
    return Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined),
    ) as Partial<T>;
  }

  private get clinicId(): string {
    return this.clinic.config.clinicId ?? this.clinic.config.bookingRefPrefix;
  }

  private get prefix(): string {
    return this.clinic.config.bookingRefPrefix;
  }

  private normalizePhone(phone: string): string {
    return phone.replace(/\D/g, '').slice(-10);
  }

  private normalizeBookingRef(bookingRef: string): string {
    return bookingRef.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  }

  private buildLookupKey(bookingRef: string, phone: string): string {
    return [
      this.clinicId,
      this.normalizeBookingRef(bookingRef),
      this.normalizePhone(phone),
    ].join('__');
  }

  private buildSlotKey(clinicId: string, date: string, time: string, doctorId?: string | null): string {
    const normalizedDoctor = (doctorId ?? 'any').replace(/[^a-zA-Z0-9_-]/g, '');
    const normalizedTime = normalizeTimeValue(time).replace(/[^0-9A-Za-z]/g, '');
    return `${clinicId}_${normalizedDoctor}_${date}_${normalizedTime}`;
  }

  private mapAppointment(id: string, data: Appointment): Appointment {
    return {
      ...data,
      id,
      time: normalizeTimeValue(data.time),
    };
  }

  private slotRefFor(data: Pick<Appointment, 'clinicId' | 'date' | 'time' | 'doctorId'>) {
    return doc(db, 'slots', this.buildSlotKey(data.clinicId, data.date, data.time, data.doctorId));
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
    const lookupKey  = this.buildLookupKey(bookingRef, data.phone);
    const normalizedTime = normalizeTimeValue(data.time);
    const appointmentPayload = this.stripUndefined({
      ...data,
      clinicId,
      lookupKey,
      bookingRef,
      time: normalizedTime,
      doctorId: data.doctorId ?? null,
      doctorName: data.doctorName ?? null,
      status: 'pending' as const,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const slotRef = this.slotRefFor({
      clinicId,
      doctorId: data.doctorId,
      date: data.date,
      time: normalizedTime,
    });
    const apptRef = doc(db, this.COLLECTION, lookupKey);

    await runTransaction(db, async (tx) => {
      const apptSnap = await tx.get(apptRef);
      if (apptSnap.exists()) {
        throw new Error('A booking with these details already exists. Please contact the clinic if you need help.');
      }

      const slotSnap = await tx.get(slotRef);
      if (slotSnap.exists()) {
        throw new Error('This time slot has just been taken. Please choose another time.');
      }

      // Reserve the slot
      tx.set(slotRef, {
        clinicId,
        doctorId:    data.doctorId ?? null,
        date:        data.date,
        time:        normalizedTime,
        appointmentId: apptRef.id,
        createdAt:   serverTimestamp(),
        updatedAt:   serverTimestamp(),
      });

      // Create the appointment
      tx.set(apptRef, appointmentPayload);
    });

    return bookingRef;
  }

  /** Fetch appointment by bookingRef + phone — scoped to this clinic. */
  async getAppointmentByRef(bookingRef: string, phone: string): Promise<Appointment | null> {
    const lookupKey = this.buildLookupKey(bookingRef, phone);
    const snap = await getDoc(doc(db, this.COLLECTION, lookupKey));
    if (!snap.exists()) return null;
    const data = snap.data() as Appointment;
    if (
      data.clinicId !== this.clinicId ||
      this.normalizeBookingRef(data.bookingRef) !== this.normalizeBookingRef(bookingRef) ||
      this.normalizePhone(data.phone) !== this.normalizePhone(phone)
    ) {
      return null;
    }
    return this.mapAppointment(snap.id, data);
  }

  /** Update editable fields: service, date, time, message. */
  async updateAppointment(
    appointment: Appointment,
    data: Partial<Pick<Appointment, 'service' | 'date' | 'time' | 'message'>>
  ): Promise<void> {
    if (!appointment.id) {
      throw new Error('Appointment reference is missing.');
    }
    if (!['pending', 'confirmed'].includes(appointment.status)) {
      throw new Error('This appointment can no longer be changed online. Please contact the clinic.');
    }

    const nextDate = data.date ?? appointment.date;
    const nextTime = normalizeTimeValue(data.time ?? appointment.time);
    const nextSlotRef = this.slotRefFor({
      clinicId: appointment.clinicId,
      doctorId: appointment.doctorId,
      date: nextDate,
      time: nextTime,
    });
    const currentSlotRef = this.slotRefFor({
      clinicId: appointment.clinicId,
      doctorId: appointment.doctorId,
      date: appointment.date,
      time: appointment.time,
    });
    const appointmentRef = doc(db, this.COLLECTION, appointment.id);
    const slotChanged = nextDate !== appointment.date || nextTime !== appointment.time;

    await runTransaction(db, async (tx) => {
      if (slotChanged) {
        const nextSlotSnap = await tx.get(nextSlotRef);
        if (nextSlotSnap.exists()) {
          throw new Error('That new time slot is no longer available. Please choose another slot.');
        }
        tx.delete(currentSlotRef);
        tx.set(nextSlotRef, {
          clinicId: appointment.clinicId,
          doctorId: appointment.doctorId ?? null,
          date: nextDate,
          time: nextTime,
          appointmentId: appointment.id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      tx.update(appointmentRef, this.stripUndefined({
        ...data,
        time: nextTime,
        status: 'pending',
        updatedAt: serverTimestamp(),
      }));
    });
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
          d => this.mapAppointment(d.id, d.data() as Appointment),
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
    return snapshot.docs.map(d => this.mapAppointment(d.id, d.data() as Appointment));
  }

  /** Set status directly (admin use). */
  async setStatus(
    id: string,
    status: 'confirmed' | 'checked_in' | 'completed' | 'no_show' | 'cancelled',
  ): Promise<void> {
    const appointmentRef = doc(db, this.COLLECTION, id);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(appointmentRef);
      if (!snap.exists()) {
        throw new Error('Appointment not found.');
      }
      const appointment = { id: snap.id, ...snap.data() } as Appointment;
      if (status === 'cancelled' && appointment.status !== 'cancelled') {
        tx.delete(this.slotRefFor({
          clinicId: appointment.clinicId,
          doctorId: appointment.doctorId,
          date: appointment.date,
          time: appointment.time,
        }));
      }
      tx.update(appointmentRef, { status, updatedAt: serverTimestamp() });
    });
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

  /** Cancel appointment — enforces 24-hour rule and releases the reserved slot. */
  async cancelAppointment(appointment: Appointment): Promise<void> {
    if (!this.canCancel(appointment.date)) {
      throw new Error(
        `Cannot cancel within 24 hours of your appointment. Please call ${this.clinic.config.phone}.`,
      );
    }
    if (!appointment.id) {
      throw new Error('Appointment reference is missing.');
    }

    const appointmentRef = doc(db, this.COLLECTION, appointment.id);
    const slotRef = this.slotRefFor({
      clinicId: appointment.clinicId,
      doctorId: appointment.doctorId,
      date: appointment.date,
      time: appointment.time,
    });

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(appointmentRef);
      if (!snap.exists()) {
        throw new Error('Appointment not found.');
      }
      tx.delete(slotRef);
      tx.update(appointmentRef, {
        status: 'cancelled',
        updatedAt: serverTimestamp(),
      });
    });
  }
}
