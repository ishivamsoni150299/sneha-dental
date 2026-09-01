import { Injectable, inject, NgZone } from '@angular/core';
import { ClinicConfigService } from './clinic-config.service';
import type { ClinicHours } from '../config/clinic.config';
import type { Doctor } from './doctor.service';
import { isBookableDateTime, normalizeTimeValue } from './doctor.service';
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
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import {
  buildAppointmentLookupKey,
  buildLegacyAppointmentLookupKey,
} from '../utils/appointment-lookup';

export type PaymentStatus = 'paid' | 'unpaid' | 'partial';
export type PaymentMethod = 'cash' | 'upi' | 'card' | 'insurance' | 'other';
export type AppointmentSource = 'clinic_website' | 'marketplace' | 'voice' | 'voice_webhook' | 'chat';
export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'checked_in'
  | 'completed'
  | 'no_show'
  | 'cancelled'
  | 'declined'
  | 'expired';
export type AppointmentCancellationActor = 'patient' | 'clinic' | 'system';

export interface BookingServiceOption {
  name: string;
  price?: string;
}

export interface AppointmentAttribution {
  marketplaceSlug?: string;
  entryPath?: string;
}

export interface BookingClinicContext {
  clinicId: string;
  bookingRefPrefix: string;
  displayName: string;
  phone: string;
  phoneE164: string;
  whatsappNumber: string;
  address: string;
  hours: ClinicHours[];
  services: BookingServiceOption[];
  doctors: Doctor[];
  isOpenNow: boolean;
  source: AppointmentSource;
  attribution?: AppointmentAttribution;
}

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const RESPONSE_WINDOW_MINUTES = 120;
const INDIA_OFFSET_MS = 330 * 60_000;

function dayNumbers(value: string): Set<number> {
  const normalized = value.toLowerCase().replace(/[\u2012-\u2015]/g, '-').trim();
  if (normalized === 'daily' || normalized === 'every day') {
    return new Set(DAY_NAMES.map((_, index) => index));
  }

  const result = new Set<number>();
  for (const part of normalized.split(/,|&/).map(item => item.trim()).filter(Boolean)) {
    const [startValue, endValue] = part.split('-').map(item => item.trim());
    const start = DAY_NAMES.indexOf(startValue.slice(0, 3) as typeof DAY_NAMES[number]);
    const end = endValue
      ? DAY_NAMES.indexOf(endValue.slice(0, 3) as typeof DAY_NAMES[number])
      : start;
    if (start < 0 || end < 0) continue;
    let current = start;
    result.add(current);
    while (current !== end) {
      current = (current + 1) % 7;
      result.add(current);
    }
  }
  return result;
}

function timeMinutes(value: string): number | null {
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i.exec(value.trim());
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  if (hours < 1 || hours > 12 || minutes > 59) return null;
  if (match[3].toUpperCase() === 'PM' && hours !== 12) hours += 12;
  if (match[3].toUpperCase() === 'AM' && hours === 12) hours = 0;
  return (hours * 60) + minutes;
}

function workingWindows(
  hours: ClinicHours[],
  reference: Date,
  dayOffset = 0,
): Array<{ start: Date; end: Date }> {
  const indiaDate = new Date(reference.getTime() + INDIA_OFFSET_MS + dayOffset * 24 * 60 * 60_000);
  const day = indiaDate.getUTCDay();
  const year = indiaDate.getUTCFullYear();
  const month = indiaDate.getUTCMonth();
  const date = indiaDate.getUTCDate();
  return hours.flatMap(entry => {
    if (!dayNumbers(entry.days).has(day)) return [];
    const values = entry.time.match(/\d{1,2}(?::\d{2})?\s*(?:AM|PM)/gi) ?? [];
    if (values.length < 2) return [];
    const startMinutes = timeMinutes(values[0]!);
    const endMinutes = timeMinutes(values[1]!);
    if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) return [];
    const start = new Date(Date.UTC(year, month, date, 0, startMinutes) - INDIA_OFFSET_MS);
    const end = new Date(Date.UTC(year, month, date, 0, endMinutes) - INDIA_OFFSET_MS);
    return [{ start, end }];
  }).sort((first, second) => first.start.getTime() - second.start.getTime());
}

export function isClinicOpenAt(hours: ClinicHours[], now = new Date()): boolean {
  if (!hours.length) return true;
  return workingWindows(hours, now).some(window => now >= window.start && now < window.end);
}

export function calculateConfirmationDeadline(hours: ClinicHours[], now = new Date()): Date {
  if (!hours.length) return new Date(now.getTime() + (RESPONSE_WINDOW_MINUTES * 60_000));

  let remainingMinutes = RESPONSE_WINDOW_MINUTES;
  for (let offset = 0; offset < 14; offset++) {
    for (const window of workingWindows(hours, now, offset)) {
      const start = new Date(Math.max(now.getTime(), window.start.getTime()));
      if (start >= window.end) continue;
      const availableMinutes = (window.end.getTime() - start.getTime()) / 60_000;
      if (remainingMinutes <= availableMinutes) {
        return new Date(start.getTime() + (remainingMinutes * 60_000));
      }
      remainingMinutes -= availableMinutes;
    }
  }

  return new Date(now.getTime() + (RESPONSE_WINDOW_MINUTES * 60_000));
}

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
  cancellationReason?: string;
  cancellationActor?: AppointmentCancellationActor;
  source?: AppointmentSource;
  phoneE164?: string;
  patientUid?: string | null;
  confirmationDeadline?: Timestamp;
  confirmationRespondedAt?: Timestamp;
  confirmationResponseMinutes?: number;
  confirmationSlaMissed?: boolean;
  confirmedAt?: Timestamp;
  declinedAt?: Timestamp;
  expiredAt?: Timestamp;
  attribution?: AppointmentAttribution;
  consentVersion?: string;
  consentAt?: Timestamp;
  status: AppointmentStatus;
  // Clinical record (filled by clinic after the visit)
  clinicNotes?:    string;
  treatmentDone?:  string;
  amountCharged?:  number;
  paymentStatus?:  PaymentStatus;
  paymentMethod?:  PaymentMethod;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
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

  private generateBookingRef(prefix = this.prefix): string {
    const chars  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const random = crypto.getRandomValues(new Uint8Array(8));
    const suffix = Array.from(random, b => chars[b % chars.length]).join('');
    return `${prefix}-${suffix}`;
  }

  /** True if appointment date is more than 24 hours from now. */
  canCancel(date: string): boolean {
    const diffHours = (new Date(date).getTime() - Date.now()) / (1000 * 60 * 60);
    return diffHours > 24;
  }

  isBookable(date: string, time: string): boolean {
    return isBookableDateTime(date, time);
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
    data: Omit<Appointment, 'id' | 'clinicId' | 'bookingRef' | 'status' | 'createdAt'>,
    context?: BookingClinicContext,
  ): Promise<string> {
    if (!this.isBookable(data.date, data.time)) {
      throw new Error('Please choose a current or future appointment slot.');
    }

    const clinicId = context?.clinicId ?? this.clinicId;
    const bookingRef = this.generateBookingRef(context?.bookingRefPrefix ?? this.prefix);
    const lookupKey = await buildAppointmentLookupKey(clinicId, bookingRef, data.phone);
    const normalizedTime = normalizeTimeValue(data.time);
    const phoneE164 = `+91${this.normalizePhone(data.phone)}`;
    const appointmentPayload = this.stripUndefined({
      ...data,
      clinicId,
      lookupKey,
      bookingRef,
      time: normalizedTime,
      doctorId: data.doctorId ?? null,
      doctorName: data.doctorName ?? null,
      status: 'pending' as const,
      source: context?.source ?? 'clinic_website',
      phoneE164,
      patientUid: data.patientUid ?? null,
      confirmationDeadline: calculateConfirmationDeadline(
        context?.hours ?? this.clinic.config.hours,
      ),
      attribution: context?.attribution,
      consentVersion: '2026-08-29',
      consentAt: serverTimestamp(),
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

    // Delivery is best-effort: a saved booking must not be submitted twice
    // just because the email provider is temporarily unavailable.
    void fetch('/api/voice-booking-action?action=notify-web-booking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clinicId, bookingRef, phone: data.phone }),
      keepalive: true,
    }).catch(() => undefined);

    return bookingRef;
  }

  /** Fetch appointment by bookingRef + phone — scoped to this clinic. */
  async getAppointmentByRef(bookingRef: string, phone: string): Promise<Appointment | null> {
    const lookupKey = await buildAppointmentLookupKey(this.clinicId, bookingRef, phone);
    let snap = await getDoc(doc(db, this.COLLECTION, lookupKey));
    if (!snap.exists()) {
      const legacyLookupKey = buildLegacyAppointmentLookupKey(this.clinicId, bookingRef, phone);
      snap = await getDoc(doc(db, this.COLLECTION, legacyLookupKey));
    }
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
    if (!this.isBookable(nextDate, nextTime)) {
      throw new Error('Please choose a current or future appointment slot.');
    }
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

  private async notifyMarketplaceStatus(id: string, status: 'confirmed' | 'declined'): Promise<void> {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      await fetch('/api/voice-booking-action?action=notify-appointment-status', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ appointmentId: id, status }),
        keepalive: true,
      });
    } catch {
      return;
    }
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
    status: 'confirmed' | 'checked_in' | 'completed' | 'no_show' | 'cancelled' | 'declined',
    cancellationReason?: string,
  ): Promise<void> {
    const appointmentRef = doc(db, this.COLLECTION, id);
    const shouldNotify = await runTransaction(db, async (tx) => {
      const snap = await tx.get(appointmentRef);
      if (!snap.exists()) {
        throw new Error('Appointment not found.');
      }
      const appointment = { id: snap.id, ...snap.data() } as Appointment;
      if (['confirmed', 'declined'].includes(status) && appointment.status !== 'pending') {
        throw new Error('This appointment request has already been handled.');
      }
      if (status === 'declined' && appointment.source !== 'marketplace') {
        throw new Error('Only marketplace requests can be declined.');
      }
      if (['cancelled', 'declined'].includes(status) && appointment.status !== status) {
        tx.delete(this.slotRefFor({
          clinicId: appointment.clinicId,
          doctorId: appointment.doctorId,
          date: appointment.date,
          time: appointment.time,
        }));
      }
      const respondedAt = serverTimestamp();
      const isMarketplaceResponse = appointment.source === 'marketplace' &&
        (status === 'confirmed' || status === 'declined');
      tx.update(appointmentRef, this.stripUndefined({
        status,
        updatedAt: serverTimestamp(),
        ...(isMarketplaceResponse ? {
          confirmationRespondedAt: respondedAt,
        } : {}),
        ...(status === 'confirmed' ? { confirmedAt: respondedAt } : {}),
        ...(status === 'declined' ? {
          declinedAt: respondedAt,
          cancellationActor: 'clinic' as const,
          cancellationReason,
        } : {}),
        ...(status === 'cancelled' ? {
          cancellationActor: 'clinic' as const,
          cancellationReason,
        } : {}),
      }));
      return appointment.source === 'marketplace';
    });
    if (shouldNotify && (status === 'confirmed' || status === 'declined')) {
      void this.notifyMarketplaceStatus(id, status);
    }
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
        cancellationActor: 'patient',
        updatedAt: serverTimestamp(),
      });
    });
  }
}
