export interface PatientIdentity {
  uid?: unknown;
  phone_number?: unknown;
  firebase?: { sign_in_provider?: unknown };
}

export interface PatientAppointmentRecord {
  id?: unknown;
  patientUid?: unknown;
  phoneE164?: unknown;
  clinicId?: unknown;
  bookingRef?: unknown;
  name?: unknown;
  service?: unknown;
  date?: unknown;
  time?: unknown;
  doctorName?: unknown;
  status?: unknown;
  cancellationReason?: unknown;
  confirmationDeadline?: unknown;
  confirmationRespondedAt?: unknown;
  confirmedAt?: unknown;
  declinedAt?: unknown;
  expiredAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  [key: string]: unknown;
}

export interface PatientAppointmentDto {
  id: string;
  clinicId: string;
  clinicName: string;
  clinicPhone: string;
  clinicAddress: string;
  marketplaceSlug: string;
  bookingRef: string;
  patientName: string;
  service: string;
  date: string;
  time: string;
  doctorName: string;
  status: string;
  cancellationReason: string;
  confirmationDeadline: string | null;
  confirmationRespondedAt: string | null;
  confirmedAt: string | null;
  declinedAt: string | null;
  expiredAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function timestampIso(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof value.toDate === 'function'
  ) {
    const date = value.toDate();
    return date instanceof Date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  return null;
}

export function normalizeIndianPatientPhone(value: unknown): string | null {
  const digits = text(value, 32).replace(/\D/g, '');
  const nationalNumber = digits.startsWith('91') && digits.length === 12
    ? digits.slice(2)
    : digits;
  return /^[6-9]\d{9}$/.test(nationalNumber) ? `+91${nationalNumber}` : null;
}

export function verifiedPatientIdentity(identity: PatientIdentity): { uid: string; phoneE164: string } | null {
  const uid = text(identity.uid, 128);
  const phoneE164 = normalizeIndianPatientPhone(identity.phone_number);
  return uid && phoneE164 && identity.firebase?.sign_in_provider === 'phone'
    ? { uid, phoneE164 }
    : null;
}

export function canClaimPatientAppointment(
  appointment: PatientAppointmentRecord,
  identity: { uid: string; phoneE164: string },
): boolean {
  const currentOwner = text(appointment.patientUid, 128);
  return (!currentOwner || currentOwner === identity.uid) &&
    normalizeIndianPatientPhone(appointment.phoneE164 || appointment['phone']) === identity.phoneE164;
}

export function toPatientAppointmentDto(
  appointment: PatientAppointmentRecord,
  clinic: Record<string, unknown> = {},
): PatientAppointmentDto {
  const address = [clinic['addressLine1'], clinic['addressLine2'], clinic['city']]
    .map(value => text(value, 160))
    .filter(Boolean)
    .join(', ')
    .slice(0, 320);

  return {
    id: text(appointment.id, 128),
    clinicId: text(appointment.clinicId, 128),
    clinicName: text(clinic['name'], 120) || 'Dental clinic',
    clinicPhone: text(clinic['phone'], 24),
    clinicAddress: address,
    marketplaceSlug: text(clinic['marketplaceSlug'], 120),
    bookingRef: text(appointment.bookingRef, 32),
    patientName: text(appointment.name, 120),
    service: text(appointment.service, 160),
    date: text(appointment.date, 20),
    time: text(appointment.time, 30),
    doctorName: text(appointment.doctorName, 120),
    status: text(appointment.status, 24),
    cancellationReason: text(appointment.cancellationReason, 240),
    confirmationDeadline: timestampIso(appointment.confirmationDeadline),
    confirmationRespondedAt: timestampIso(appointment.confirmationRespondedAt),
    confirmedAt: timestampIso(appointment.confirmedAt),
    declinedAt: timestampIso(appointment.declinedAt),
    expiredAt: timestampIso(appointment.expiredAt),
    createdAt: timestampIso(appointment.createdAt),
    updatedAt: timestampIso(appointment.updatedAt),
  };
}

export function normalizePatientBookingRef(value: unknown): string | null {
  const bookingRef = text(value, 32).toUpperCase().replace(/[^A-Z0-9-]/g, '');
  return /^[A-Z0-9]{1,20}-[A-Z0-9]{8}$/.test(bookingRef) ? bookingRef : null;
}

function appointmentDateTime(appointment: PatientAppointmentRecord): Date | null {
  const date = text(appointment.date, 10);
  const time = text(appointment.time, 8);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const value = new Date(`${date}T${time}:00+05:30`);
  return Number.isFinite(value.getTime()) ? value : null;
}

export function canPatientManageAppointment(
  appointment: PatientAppointmentRecord,
  identity: { uid: string; phoneE164: string },
): boolean {
  return text(appointment.patientUid, 128) === identity.uid &&
    normalizeIndianPatientPhone(appointment.phoneE164 || appointment['phone']) === identity.phoneE164 &&
    ['pending', 'confirmed'].includes(text(appointment.status, 24));
}

export function canPatientCancelAppointment(
  appointment: PatientAppointmentRecord,
  identity: { uid: string; phoneE164: string },
  now = new Date(),
): boolean {
  const scheduledAt = appointmentDateTime(appointment);
  return canPatientManageAppointment(appointment, identity) &&
    scheduledAt !== null &&
    scheduledAt.getTime() - now.getTime() > 24 * 60 * 60_000;
}

export function normalizePatientReschedule(
  dateValue: unknown,
  timeValue: unknown,
  now = new Date(),
): { date: string; time: string } | null {
  const date = text(dateValue, 10);
  const time = text(timeValue, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const scheduledAt = new Date(`${date}T${time}:00+05:30`);
  if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.toLocaleDateString('en-CA', {
    timeZone: 'Asia/Kolkata',
  }) !== date) return null;
  return scheduledAt.getTime() > now.getTime() + 15 * 60_000 ? { date, time } : null;
}

interface ClinicHoursRecord {
  days?: unknown;
  time?: unknown;
}

const INDIA_OFFSET_MS = 330 * 60_000;
const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function dayNumbers(value: unknown): Set<number> {
  const normalized = text(value, 120).toLowerCase().replace(/[\u2012-\u2015]/g, '-');
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
  return hours * 60 + minutes;
}

export function calculatePatientConfirmationDeadline(
  hoursValue: unknown,
  now = new Date(),
): Date {
  const hours = Array.isArray(hoursValue) ? hoursValue as ClinicHoursRecord[] : [];
  if (!hours.length) return new Date(now.getTime() + 120 * 60_000);

  let remainingMinutes = 120;
  for (let offset = 0; offset < 14; offset++) {
    const indiaDate = new Date(now.getTime() + INDIA_OFFSET_MS + offset * 24 * 60 * 60_000);
    const day = indiaDate.getUTCDay();
    const year = indiaDate.getUTCFullYear();
    const month = indiaDate.getUTCMonth();
    const date = indiaDate.getUTCDate();

    const windows = hours.flatMap(entry => {
      if (!dayNumbers(entry.days).has(day)) return [];
      const values = text(entry.time, 120).match(/\d{1,2}(?::\d{2})?\s*(?:AM|PM)/gi) ?? [];
      if (values.length < 2) return [];
      const startMinutes = timeMinutes(values[0]!);
      const endMinutes = timeMinutes(values[1]!);
      if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) return [];
      return [{ startMinutes, endMinutes }];
    }).sort((first, second) => first.startMinutes - second.startMinutes);

    for (const window of windows) {
      const windowStart = Date.UTC(year, month, date, 0, window.startMinutes) - INDIA_OFFSET_MS;
      const windowEnd = Date.UTC(year, month, date, 0, window.endMinutes) - INDIA_OFFSET_MS;
      const start = Math.max(now.getTime(), windowStart);
      if (start >= windowEnd) continue;
      const availableMinutes = (windowEnd - start) / 60_000;
      if (remainingMinutes <= availableMinutes) {
        return new Date(start + remainingMinutes * 60_000);
      }
      remainingMinutes -= availableMinutes;
    }
  }
  return new Date(now.getTime() + 120 * 60_000);
}

interface PatientRescheduleClinic {
  active?: unknown;
  hours?: unknown;
}

interface PatientRescheduleDoctor {
  available?: unknown;
  schedule?: unknown;
}

function twentyFourHourMinutes(value: unknown): number | null {
  const input = text(value, 5);
  if (!/^\d{2}:\d{2}$/.test(input)) return null;
  const [hours, minutes] = input.split(':').map(Number);
  return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : null;
}

function isoDay(date: string): typeof DAY_NAMES[number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const parsed = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return parsed.toISOString().slice(0, 10) === date ? DAY_NAMES[parsed.getUTCDay()] : null;
}

function slotsBetween(start: number | null, end: number | null): string[] {
  if (start == null || end == null || end <= start) return [];
  const slots: string[] = [];
  for (let minutes = start; minutes < end; minutes += 30) {
    slots.push(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
  }
  return slots;
}

function scheduledPatientRescheduleSlots(
  date: string,
  clinic: PatientRescheduleClinic,
  doctor?: PatientRescheduleDoctor | null,
): string[] {
  if (clinic.active !== true) return [];
  const day = isoDay(date);
  if (!day) return [];

  if (doctor) {
    if (doctor.available !== true || !doctor.schedule || typeof doctor.schedule !== 'object') return [];
    const schedule = (doctor.schedule as Record<string, unknown>)[day];
    if (!schedule || typeof schedule !== 'object') return [];
    const record = schedule as Record<string, unknown>;
    return record['enabled'] === true
      ? slotsBetween(twentyFourHourMinutes(record['start']), twentyFourHourMinutes(record['end']))
      : [];
  }

  const hours = Array.isArray(clinic.hours) ? clinic.hours as ClinicHoursRecord[] : [];
  if (!hours.length) return slotsBetween(9 * 60, 19 * 60 + 30);
  const slots = hours.flatMap(entry => {
    if (!dayNumbers(entry.days).has(DAY_NAMES.indexOf(day))) return [];
    const values = text(entry.time, 120).match(/\d{1,2}(?::\d{2})?\s*(?:AM|PM)/gi) ?? [];
    return values.length >= 2
      ? slotsBetween(timeMinutes(values[0]!), timeMinutes(values[1]!))
      : [];
  });
  return [...new Set(slots)].sort();
}

export function patientRescheduleSlotsForDate(
  date: string,
  clinic: PatientRescheduleClinic,
  doctor?: PatientRescheduleDoctor | null,
  now = new Date(),
): string[] {
  return scheduledPatientRescheduleSlots(date, clinic, doctor)
    .filter(time => normalizePatientReschedule(date, time, now) !== null);
}

export function isPatientRescheduleSlotAllowed(
  date: string,
  time: string,
  clinic: PatientRescheduleClinic,
  doctor?: PatientRescheduleDoctor | null,
): boolean {
  const requestedMinutes = twentyFourHourMinutes(time);
  if (requestedMinutes == null) return false;
  const normalized = `${String(Math.floor(requestedMinutes / 60)).padStart(2, '0')}:${String(requestedMinutes % 60).padStart(2, '0')}`;
  return normalized === time && scheduledPatientRescheduleSlots(date, clinic, doctor).includes(normalized);
}