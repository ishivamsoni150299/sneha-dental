import { randomBytes } from 'crypto';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';

export interface VoiceBookingInput {
  clinicId: string;
  bookingRefPrefix?: string;
  name?: string;
  phone?: string;
  email?: string;
  service?: string;
  preferredDate?: string;
  preferredTime?: string;
  message?: string;
  transcript?: string;
  allowPartial?: boolean;
  source?: 'voice' | 'voice_webhook' | 'chat';
}

export interface VoiceBookingResult {
  ok: boolean;
  bookingCreated: boolean;
  bookingRef?: string;
  code?: 'missing_fields' | 'duplicate_recent' | 'slot_taken' | 'write_failed';
  message: string;
  missingFields?: string[];
}

interface NormalizedVoiceBooking {
  clinicId: string;
  bookingRefPrefix: string;
  name: string;
  phone: string;
  email: string;
  service: string;
  date: string;
  time: string;
  message: string;
  source: 'voice' | 'voice_webhook' | 'chat';
}

const DEFAULT_PREFIX = 'VOICE';

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength) : '';
}

function normalizePhone(value: unknown): string {
  const raw = cleanText(value, 24);
  const cleaned = raw.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.length === 12 && cleaned.startsWith('91')) return `+${cleaned}`;
  if (cleaned.length === 10 && /^[6-9]/.test(cleaned)) return `+91${cleaned}`;
  return cleaned;
}

function normalizeBookingRef(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
}

function normalizePhoneLookup(value: string): string {
  return value.replace(/\D/g, '').slice(-10);
}

function generateBookingRef(prefix: string): string {
  const safePrefix = normalizeBookingRef(prefix || DEFAULT_PREFIX) || DEFAULT_PREFIX;
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = randomBytes(8);
  const suffix = Array.from(bytes, byte => chars[byte % chars.length]).join('');
  return `${safePrefix}-${suffix}`;
}

function addDaysIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function nextWeekdayIso(dayName: string): string {
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const target = days.findIndex(day => dayName.toLowerCase().startsWith(day));
  if (target < 0) return '';

  const date = new Date();
  const current = date.getDay();
  const delta = ((target - current + 7) % 7) || 7;
  date.setDate(date.getDate() + delta);
  return date.toISOString().slice(0, 10);
}

export function normalizePreferredDate(value: unknown): string {
  const raw = cleanText(value, 40).toLowerCase();
  if (!raw) return '';
  if (raw === 'today') return addDaysIso(0);
  if (raw === 'tomorrow' || raw === 'kal') return addDaysIso(1);
  if (raw.includes('day after tomorrow') || raw === 'parso') return addDaysIso(2);

  const iso = raw.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const [, year, month, day] = iso;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const slash = raw.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (slash) {
    const [, day, month, yearInput] = slash;
    const year = yearInput
      ? (yearInput.length === 2 ? `20${yearInput}` : yearInput)
      : String(new Date().getFullYear());
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const weekday = raw.match(/\b(mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/);
  return weekday?.[1] ? nextWeekdayIso(weekday[1]) : cleanText(value, 40);
}

export function normalizePreferredTime(value: unknown): string {
  const raw = cleanText(value, 40).toLowerCase();
  if (!raw) return '';

  const match = raw.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\b/);
  if (!match) return cleanText(value, 40);

  const suffix = match[3]?.replace(/\./g, '') ?? '';
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? '0');
  if (!Number.isFinite(hour) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return cleanText(value, 40);
  }
  if (suffix === 'pm' && hour < 12) hour += 12;
  if (suffix === 'am' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function buildLookupKey(clinicId: string, bookingRef: string, phone: string): string {
  return [
    clinicId,
    normalizeBookingRef(bookingRef),
    normalizePhoneLookup(phone),
  ].join('__');
}

function buildSlotKey(clinicId: string, date: string, time: string): string {
  return `${clinicId}_any_${date}_${time.replace(/[^0-9A-Za-z]/g, '')}`;
}

function hasReservableSlot(date: string, time: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time);
}

function normalizeInput(input: VoiceBookingInput): NormalizedVoiceBooking {
  const transcript = cleanText(input.transcript, 1200);
  const message = cleanText(input.message, 500) || transcript;
  return {
    clinicId: cleanText(input.clinicId, 80),
    bookingRefPrefix: cleanText(input.bookingRefPrefix, 16) || DEFAULT_PREFIX,
    name: cleanText(input.name, 80),
    phone: normalizePhone(input.phone),
    email: cleanText(input.email, 120),
    service: cleanText(input.service, 120),
    date: normalizePreferredDate(input.preferredDate),
    time: normalizePreferredTime(input.preferredTime),
    message,
    source: input.source ?? 'voice',
  };
}

function missingFields(input: NormalizedVoiceBooking, allowPartial: boolean): string[] {
  const missing: string[] = [];
  if (allowPartial) {
    if (!input.name && !input.phone) missing.push('patient name or phone number');
    return missing;
  }

  if (!input.name) missing.push('patient name');
  if (!input.phone) missing.push('phone number');
  if (!input.service) missing.push('treatment or dental issue');
  if (!input.date) missing.push('preferred date');
  if (!input.time) missing.push('preferred time');
  return missing;
}

export async function createVoiceBookingRequest(
  db: Firestore,
  input: VoiceBookingInput,
): Promise<VoiceBookingResult> {
  const booking = normalizeInput(input);
  const missing = missingFields(booking, input.allowPartial === true);

  if (!booking.clinicId || missing.length > 0) {
    const missingFieldsList = !booking.clinicId ? ['clinic id', ...missing] : missing;
    return {
      ok: false,
      bookingCreated: false,
      code: 'missing_fields',
      missingFields: missingFieldsList,
      message: `I still need ${missingFieldsList.join(', ')} before I can submit the appointment request.`,
    };
  }

  const recent = booking.phone
    ? await db.collection('appointments')
      .where('clinicId', '==', booking.clinicId)
      .where('phone', '==', booking.phone)
      .limit(5)
      .get()
    : null;

  const now = Date.now();
  const recentMatch = recent?.docs.find(doc => {
    const data = doc.data();
    const createdAt = data['createdAt'];
    const createdAtMs =
      typeof createdAt?.toDate === 'function'
        ? createdAt.toDate().getTime()
        : 0;
    return createdAtMs > 0 && (now - createdAtMs) < 30 * 60 * 1000;
  });

  if (recentMatch) {
    const existingRef = cleanText(recentMatch.data()['bookingRef'], 32);
    return {
      ok: true,
      bookingCreated: false,
      code: 'duplicate_recent',
      bookingRef: existingRef,
      message: existingRef
        ? `Your appointment request is already submitted. Booking reference ${existingRef}.`
        : 'Your appointment request is already submitted. The clinic team will confirm shortly.',
    };
  }

  const bookingRef = generateBookingRef(booking.bookingRefPrefix);
  const lookupKey = buildLookupKey(booking.clinicId, bookingRef, booking.phone);
  const appointmentRef = db.collection('appointments').doc(lookupKey);
  const slotRef = hasReservableSlot(booking.date, booking.time)
    ? db.collection('slots').doc(buildSlotKey(booking.clinicId, booking.date, booking.time))
    : null;

  try {
    await db.runTransaction(async tx => {
      if (slotRef) {
        const slotSnap = await tx.get(slotRef);
        if (slotSnap.exists) {
          throw new Error('SLOT_TAKEN');
        }

        tx.set(slotRef, {
          clinicId: booking.clinicId,
          doctorId: null,
          date: booking.date,
          time: booking.time,
          appointmentId: appointmentRef.id,
          source: booking.source,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      tx.set(appointmentRef, {
        clinicId: booking.clinicId,
        lookupKey,
        bookingRef,
        name: booking.name,
        phone: booking.phone,
        email: booking.email,
        service: booking.service || 'Dental Consultation',
        date: booking.date,
        time: booking.time,
        doctorId: null,
        doctorName: null,
        message: booking.message ? `AI voice booking request. ${booking.message}` : 'AI voice booking request.',
        status: 'pending',
        source: booking.source,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return {
      ok: true,
      bookingCreated: true,
      bookingRef,
      message: `Done. I submitted the appointment request. Booking reference ${bookingRef}. The clinic team will confirm the slot by call or WhatsApp.`,
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'SLOT_TAKEN') {
      return {
        ok: false,
        bookingCreated: false,
        code: 'slot_taken',
        message: 'That time slot is already taken. Please ask the patient for another preferred time.',
      };
    }

    console.error('[voice-booking-action] Firestore write failed:', error);
    return {
      ok: false,
      bookingCreated: false,
      code: 'write_failed',
      message: 'I could not submit the booking request right now. Please ask the patient to use WhatsApp or the booking form.',
    };
  }
}
