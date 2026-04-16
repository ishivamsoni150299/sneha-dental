import { Injectable, inject } from '@angular/core';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, query, where, orderBy, serverTimestamp, type Timestamp,
  type UpdateData, type DocumentData,
} from 'firebase/firestore';
import { db } from '../firebase';
import { ClinicConfigService } from './clinic-config.service';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DaySchedule {
  enabled: boolean;
  start:   string;   // "09:00"
  end:     string;   // "17:00"
}

export type WeekDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface Doctor {
  id?:           string;
  name:          string;
  qualification: string;
  speciality:    string;
  available:     boolean;           // overall on/off toggle
  schedule:      Record<WeekDay, DaySchedule>;
  createdAt?:    Timestamp;
}

export const WEEK_DAYS: { key: WeekDay; label: string }[] = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

export const DEFAULT_SCHEDULE: Record<WeekDay, DaySchedule> = {
  mon: { enabled: true,  start: '09:00', end: '17:00' },
  tue: { enabled: true,  start: '09:00', end: '17:00' },
  wed: { enabled: true,  start: '09:00', end: '17:00' },
  thu: { enabled: true,  start: '09:00', end: '17:00' },
  fri: { enabled: true,  start: '09:00', end: '17:00' },
  sat: { enabled: true,  start: '09:00', end: '13:00' },
  sun: { enabled: false, start: '09:00', end: '13:00' },
};

// ── Day-of-week index → WeekDay key ──────────────────────────────────────────
const DAY_INDEX_MAP: WeekDay[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Generate 30-minute time slots between start and end (exclusive of end). */
export function generateSlots(start: string, end: string): string[] {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const startMin = sh * 60 + sm;
  const endMin   = eh * 60 + em;
  const slots: string[] = [];
  for (let m = startMin; m < endMin; m += 30) {
    const h   = Math.floor(m / 60);
    const min = m % 60;
    slots.push(`${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
  }
  return slots;
}

/** Format "HH:MM" to "h:MM AM/PM" for display. */
export function formatSlotDisplay(t: string): string {
  const [hStr, mStr] = t.split(':');
  const h = parseInt(hStr, 10);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12    = h > 12 ? h - 12 : (h === 0 ? 12 : h);
  return `${h12}:${mStr} ${period}`;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class DoctorService {
  private readonly clinic = inject(ClinicConfigService);

  private doctorsCol(clinicId: string) {
    return collection(db, 'clinics', clinicId, 'doctors');
  }

  /** Load all doctors for a clinic, ordered by name. */
  async getDoctors(clinicId: string): Promise<Doctor[]> {
    const snap = await getDocs(query(this.doctorsCol(clinicId), orderBy('name')));
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Doctor, 'id'>) }));
  }

  /** Add a new doctor, returns the new doc ID. */
  async addDoctor(clinicId: string, data: Omit<Doctor, 'id' | 'createdAt'>): Promise<string> {
    const ref = await addDoc(this.doctorsCol(clinicId), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  }

  /** Update doctor fields (partial). */
  async updateDoctor(clinicId: string, doctorId: string, data: Partial<Doctor>): Promise<void> {
    await updateDoc(
      doc(db, 'clinics', clinicId, 'doctors', doctorId),
      data as UpdateData<DocumentData>,
    );
  }

  /** Delete a doctor document. */
  async deleteDoctor(clinicId: string, doctorId: string): Promise<void> {
    await deleteDoc(doc(db, 'clinics', clinicId, 'doctors', doctorId));
  }

  /**
   * Returns available (unbooked) time slots for a given doctor on a given date.
   * Slots are derived from the doctor's weekly schedule, minus already-booked appointments.
   * @param clinicId  Firestore clinic ID
   * @param doctor    The doctor object (schedule already loaded)
   * @param date      "YYYY-MM-DD"
   */
  async getAvailableSlots(clinicId: string, doctor: Doctor, date: string): Promise<string[]> {
    if (!doctor.available) return [];

    const dayOfWeek = DAY_INDEX_MAP[new Date(date + 'T00:00:00').getDay()];
    const daySchedule = doctor.schedule[dayOfWeek];
    if (!daySchedule.enabled) return [];

    const allSlots = generateSlots(daySchedule.start, daySchedule.end);
    if (allSlots.length === 0) return [];

    // Query booked appointments for this doctor + date (exclude cancelled)
    const snap = await getDocs(query(
      collection(db, 'appointments'),
      where('clinicId',  '==', clinicId),
      where('doctorId',  '==', doctor.id),
      where('date',      '==', date),
      where('status',    'in', ['pending', 'confirmed', 'checked_in']),
    ));

    const bookedTimes = new Set(snap.docs.map(d => (d.data() as { time?: string }).time ?? ''));
    return allSlots.filter(s => !bookedTimes.has(s));
  }
}
