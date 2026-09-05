import { Injectable, inject } from '@angular/core';
import { ClinicConfigService } from './clinic-config.service';
import type { ClinicHours } from '../config/clinic.config';
import type { Doctor } from './doctor.service';
import { isBookableDateTime, normalizeTimeValue } from './doctor.service';
import { AuthenticatedApiService } from './authenticated-api.service';

type Unsubscribe = () => void;

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
  confirmationDeadline?: string;
  confirmationRespondedAt?: string;
  confirmationResponseMinutes?: number;
  confirmationSlaMissed?: boolean;
  confirmedAt?: string;
  declinedAt?: string;
  expiredAt?: string;
  attribution?: AppointmentAttribution;
  consentVersion?: string;
  consentAt?: string;
  status: AppointmentStatus;
  // Clinical record (filled by clinic after the visit)
  clinicNotes?:    string;
  treatmentDone?:  string;
  amountCharged?:  number;
  paymentStatus?:  PaymentStatus;
  paymentMethod?:  PaymentMethod;
  createdAt?: string;
  updatedAt?: string;
}

@Injectable({ providedIn: 'root' })
export class AppointmentService {
  private readonly clinic = inject(ClinicConfigService);
  private readonly api = inject(AuthenticatedApiService);

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

  private async error(response: Response, fallback: string): Promise<Error> {
    const body = await response.json().catch(() => null) as { detail?: string; message?: string } | null;
    return new Error(body?.detail ?? body?.message ?? fallback);
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
   * Sends the booking to the Java API, which atomically reserves the slot and
   * creates the appointment to prevent double-booking.
   *
   * If two patients submit simultaneously for the same clinic/doctor/date/time,
   * only one transaction succeeds — the other gets a "slot taken" error.
   *
   * The API owns slot reservation and conflict handling.
   */
  async bookAppointment(
    data: Omit<Appointment, 'id' | 'clinicId' | 'bookingRef' | 'status' | 'createdAt'>,
    context?: BookingClinicContext,
  ): Promise<string> {
    if (!this.isBookable(data.date, data.time)) {
      throw new Error('Please choose a current or future appointment slot.');
    }

    const clinicId = context?.clinicId ?? this.clinicId;
    const normalizedTime = normalizeTimeValue(data.time);
    const response = await fetch('/api/public/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
      ...data,
      clinicId,
      bookingRefPrefix: context?.bookingRefPrefix ?? this.prefix,
      time: normalizedTime,
      doctorId: data.doctorId ?? null,
      source: context?.source ?? 'clinic_website',
      confirmationDeadline: calculateConfirmationDeadline(
        context?.hours ?? this.clinic.config.hours,
      ).toISOString(),
      attribution: context?.attribution,
      consentVersion: '2026-08-29',
      }),
    });
    if (!response.ok) throw await this.error(response, 'Could not book this appointment.');
    return (await response.json() as { bookingRef: string }).bookingRef;
  }

  /** Fetch appointment by bookingRef + phone — scoped to this clinic. */
  async getAppointmentByRef(bookingRef: string, phone: string): Promise<Appointment | null> {
    const params = new URLSearchParams({ clinicId: this.clinicId, bookingRef, phone });
    const response = await fetch(`/api/public/appointments/lookup?${params}`);
    if (response.status === 404) return null;
    if (!response.ok) throw await this.error(response, 'Could not find this appointment.');
    return await response.json() as Appointment;
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
    const response = await fetch(`/api/public/appointments/${encodeURIComponent(appointment.id)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, phone: appointment.phone, date: nextDate, time: nextTime }),
    });
    if (!response.ok) throw await this.error(response, 'Could not update this appointment.');
  }

  /**
   * Subscribe to real-time appointment updates for this clinic.
   *
   * Calls `onNext` after the API loads appointments and on each polling refresh.
   * Returns an `Unsubscribe` function — call it
   * in `ngOnDestroy` to stop listening and prevent memory leaks.
   *
   * Runs the callback inside `NgZone.run()` so Angular's OnPush
   * change detection picks up every update automatically.
   */
  subscribeToAppointments(
    onNext: (appointments: Appointment[]) => void,
    onError?: (err: Error) => void,
  ): Unsubscribe {
    let active = true;
    const load = async () => {
      try {
        const appointments = await this.getAllAppointments();
        if (active) onNext(appointments);
      } catch (error) {
        if (active) onError?.(error instanceof Error ? error : new Error('Could not load appointments.'));
      }
    };
    void load();
    const timer = setInterval(() => void load(), 15_000);
    return () => { active = false; clearInterval(timer); };
  }

  /**
   * One-shot fetch — kept for contexts that don't need real-time
   * (e.g. super-admin cross-clinic views, CSV export).
   */
  async getAllAppointments(): Promise<Appointment[]> {
    const response = await this.api.fetch('/api/clinics/current/appointments');
    if (!response.ok) throw await this.error(response, 'Could not load appointments.');
    return await response.json() as Appointment[];
  }

  /** Set status directly (admin use). */
  async setStatus(
    id: string,
    status: 'confirmed' | 'checked_in' | 'completed' | 'no_show' | 'cancelled' | 'declined',
    cancellationReason?: string,
  ): Promise<void> {
    const response = await this.api.fetch(`/api/clinics/current/appointments/${encodeURIComponent(id)}/status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, cancellationReason }),
    });
    if (!response.ok) throw await this.error(response, 'Could not update appointment status.');
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
      const response = await this.api.fetch(`/api/clinics/current/appointments/${encodeURIComponent(id)}/clinical`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (!response.ok) throw await this.error(response, 'Could not save clinical details.');
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

    const response = await fetch(`/api/public/appointments/${encodeURIComponent(appointment.id)}/cancel`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: appointment.phone }),
    });
    if (!response.ok) throw await this.error(response, 'Could not cancel this appointment.');
  }
}
