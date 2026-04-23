import { Injectable, inject } from '@angular/core';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, query, where, serverTimestamp, type Timestamp,
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

export const DEFAULT_BOOKING_SLOTS = generateSlots('09:00', '19:30');

/** Normalize either "HH:MM" or "h:MM AM/PM" to canonical "HH:MM". */
export function normalizeTimeValue(time: string): string {
  const value = time.trim();
  if (/^\d{2}:\d{2}$/.test(value)) {
    return value;
  }

  const match = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) {
    return value;
  }

  let hours = Number(match[1]);
  const minutes = match[2];
  const meridiem = match[3].toUpperCase();

  if (meridiem === 'PM' && hours !== 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;

  return `${String(hours).padStart(2, '0')}:${minutes}`;
}

function toTimeMinutes(value: string): number | null {
  const normalized = normalizeTimeValue(value);
  if (!/^\d{2}:\d{2}$/.test(normalized)) return null;

  const [hours, minutes] = normalized.split(':').map(Number);
  return hours * 60 + minutes;
}

export function isPastDate(date: string, now = new Date()): boolean {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const selected = new Date(`${date}T00:00:00`);
  return selected.getTime() < today.getTime();
}

export function isBookableDateTime(date: string, time: string, now = new Date()): boolean {
  if (!date || !time) return false;
  if (isPastDate(date, now)) return false;

  const selected = new Date(`${date}T00:00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (selected.getTime() > today.getTime()) return true;

  const slotMinutes = toTimeMinutes(time);
  if (slotMinutes == null) return false;

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return slotMinutes >= nowMinutes;
}

export function filterBookableSlots(date: string, slots: string[], now = new Date()): string[] {
  if (!date) return [];
  return slots.filter(slot => isBookableDateTime(date, slot, now));
}

/** Format a normalized or legacy time value to "h:MM AM/PM" for display. */
export function formatSlotDisplay(t: string): string {
  const normalized = normalizeTimeValue(t);
  if (!/^\d{2}:\d{2}$/.test(normalized)) {
    return t;
  }

  const [hStr, mStr] = normalized.split(':');
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

  /** Load all doctors for a clinic, sorted by name client-side. */
  async getDoctors(clinicId: string): Promise<Doctor[]> {
    const snap = await getDocs(this.doctorsCol(clinicId));
    const docs = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Doctor, 'id'>) }));
    return docs.sort((a, b) => a.name.localeCompare(b.name));
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
   * Slots are derived from the doctor's weekly schedule, minus reserved slot docs.
   * @param clinicId  Firestore clinic ID
   * @param doctor    The doctor object (schedule already loaded)
   * @param date      "YYYY-MM-DD"
   */
  async getAvailableSlots(clinicId: string, doctor: Doctor, date: string): Promise<string[]> {
    if (!doctor.available) return [];
    if (isPastDate(date)) return [];

    const dayOfWeek = DAY_INDEX_MAP[new Date(date + 'T00:00:00').getDay()];
    const daySchedule = doctor.schedule[dayOfWeek];
    if (!daySchedule.enabled) return [];

    const allSlots = generateSlots(daySchedule.start, daySchedule.end);
    if (allSlots.length === 0) return [];

    // Query reserved slots for this doctor + date.
    const snap = await getDocs(query(
      collection(db, 'slots'),
      where('clinicId',  '==', clinicId),
      where('doctorId',  '==', doctor.id),
      where('date',      '==', date),
    ));

    const bookedTimes = new Set(
      snap.docs
        .map(d => normalizeTimeValue((d.data() as { time?: string }).time ?? ''))
        .filter(Boolean),
    );
    return filterBookableSlots(date, allSlots.filter(s => !bookedTimes.has(s)));
  }
}
