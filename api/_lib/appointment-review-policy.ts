import { createHash } from 'crypto';

interface ReviewableAppointmentRecord {
  patientUid?: unknown;
  phoneE164?: unknown;
  phone?: unknown;
  status?: unknown;
}

export type AppointmentReviewModerationStatus = 'pending' | 'published' | 'rejected';
export type AppointmentReviewReportReason = 'privacy' | 'abuse' | 'misleading' | 'other';

export interface AppointmentReviewRecord {
  id?: unknown;
  clinicId?: unknown;
  rating?: unknown;
  text?: unknown;
  patientAlias?: unknown;
  moderationStatus?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  publishedAt?: unknown;
  clinicResponse?: unknown;
  clinicRespondedAt?: unknown;
  [key: string]: unknown;
}

export interface PublicAppointmentReviewDto {
  id: string;
  clinicId: string;
  rating: number;
  text: string;
  patientAlias: string;
  publishedAt: string | null;
  clinicResponse: string;
  clinicRespondedAt: string | null;
}

export interface PatientAppointmentReviewDto extends PublicAppointmentReviewDto {
  moderationStatus: AppointmentReviewModerationStatus;
  createdAt: string | null;
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function normalizeIndianPhone(value: unknown): string | null {
  const digits = text(value, 32).replace(/\D/g, '');
  const nationalNumber = digits.startsWith('91') && digits.length === 12 ? digits.slice(2) : digits;
  return /^[6-9]\d{9}$/.test(nationalNumber) ? `+91${nationalNumber}` : null;
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

export function appointmentReviewId(appointmentIdValue: unknown): string | null {
  const appointmentId = text(appointmentIdValue, 128);
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(appointmentId)) return null;
  const digest = createHash('sha256')
    .update(`appointment-review:${appointmentId}`)
    .digest('hex');
  return `review_${digest}`;
}

export function canSubmitAppointmentReview(
  appointment: ReviewableAppointmentRecord,
  identity: { uid: string; phoneE164: string },
): boolean {
  return text(appointment.status, 24) === 'completed' &&
    text(appointment.patientUid, 128) === identity.uid &&
    normalizeIndianPhone(appointment.phoneE164 || appointment.phone) === identity.phoneE164;
}

export function patientReviewAlias(nameValue: unknown, anonymousValue: unknown): string {
  if (anonymousValue === true) return 'Verified patient';
  const parts = text(nameValue, 120).split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Verified patient';
  const firstName = parts[0]!.slice(0, 40);
  const familyInitial = parts.length > 1 ? ` ${parts[parts.length - 1]![0]!.toUpperCase()}.` : '';
  return `${firstName}${familyInitial}`;
}

export function normalizeAppointmentReviewInput(
  ratingValue: unknown,
  textValue: unknown,
  anonymousValue: unknown,
): { rating: number; text: string; anonymous: boolean } | null {
  if (!Number.isInteger(ratingValue) || Number(ratingValue) < 1 || Number(ratingValue) > 5) return null;
  if (typeof textValue !== 'string' || textValue.trim().length > 1200) return null;
  const reviewText = textValue.trim().replace(/\r\n/g, '\n');
  return {
    rating: Number(ratingValue),
    text: reviewText,
    anonymous: anonymousValue === true,
  };
}

export function normalizeAppointmentReviewReport(
  reasonValue: unknown,
  detailsValue: unknown,
): { reason: AppointmentReviewReportReason; details: string } | null {
  const reason = text(reasonValue, 24) as AppointmentReviewReportReason;
  const details = typeof detailsValue === 'string' ? detailsValue.trim() : '';
  if (!['privacy', 'abuse', 'misleading', 'other'].includes(reason) || details.length > 500) return null;
  return { reason, details };
}

export function normalizeClinicReviewResponse(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const response = value.trim();
  return response.length >= 2 && response.length <= 600 ? response : null;
}

export function toPublicAppointmentReviewDto(
  review: AppointmentReviewRecord,
): PublicAppointmentReviewDto | null {
  const rating = Number(review.rating);
  if (
    review.moderationStatus !== 'published' ||
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5
  ) {
    return null;
  }
  return {
    id: text(review.id, 80),
    clinicId: text(review.clinicId, 128),
    rating,
    text: text(review.text, 1200),
    patientAlias: text(review.patientAlias, 48) || 'Verified patient',
    publishedAt: timestampIso(review.publishedAt),
    clinicResponse: text(review.clinicResponse, 600),
    clinicRespondedAt: timestampIso(review.clinicRespondedAt),
  };
}

export function toPatientAppointmentReviewDto(
  review: AppointmentReviewRecord,
): PatientAppointmentReviewDto | null {
  const moderationStatus = review.moderationStatus as AppointmentReviewModerationStatus;
  const rating = Number(review.rating);
  if (
    !['pending', 'published', 'rejected'].includes(moderationStatus) ||
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5
  ) {
    return null;
  }
  return {
    id: text(review.id, 80),
    clinicId: text(review.clinicId, 128),
    rating,
    text: text(review.text, 1200),
    patientAlias: text(review.patientAlias, 48) || 'Verified patient',
    moderationStatus,
    createdAt: timestampIso(review.createdAt),
    publishedAt: timestampIso(review.publishedAt),
    clinicResponse: text(review.clinicResponse, 600),
    clinicRespondedAt: timestampIso(review.clinicRespondedAt),
  };
}