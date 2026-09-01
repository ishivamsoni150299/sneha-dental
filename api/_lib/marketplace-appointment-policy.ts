export interface MarketplaceAppointmentRecord {
  clinicId?: unknown;
  doctorId?: unknown;
  date?: unknown;
  time?: unknown;
  source?: unknown;
  status?: unknown;
  confirmationDeadline?: unknown;
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function normalizeAppointmentTime(value: unknown): string {
  const input = text(value, 30);
  if (/^\d{2}:\d{2}$/.test(input)) return input;
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(input);
  if (!match) return input;
  let hours = Number(match[1]);
  if (match[3].toUpperCase() === 'PM' && hours !== 12) hours += 12;
  if (match[3].toUpperCase() === 'AM' && hours === 12) hours = 0;
  return `${String(hours).padStart(2, '0')}:${match[2]}`;
}

export function buildAppointmentSlotId(appointment: MarketplaceAppointmentRecord): string {
  const clinicId = text(appointment.clinicId, 128);
  const doctorId = text(appointment.doctorId, 128).replace(/[^a-zA-Z0-9_-]/g, '') || 'any';
  const date = text(appointment.date, 20);
  const time = normalizeAppointmentTime(appointment.time).replace(/[^0-9A-Za-z]/g, '');
  return `${clinicId}_${doctorId}_${date}_${time}`;
}

function deadlineDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof value.toDate === 'function'
  ) {
    const date = value.toDate();
    return date instanceof Date ? date : null;
  }
  return null;
}

export function isOverdueMarketplaceRequest(
  appointment: MarketplaceAppointmentRecord,
  now = new Date(),
): boolean {
  const deadline = deadlineDate(appointment.confirmationDeadline);
  return appointment.source === 'marketplace' &&
    appointment.status === 'pending' &&
    deadline !== null &&
    deadline.getTime() <= now.getTime();
}