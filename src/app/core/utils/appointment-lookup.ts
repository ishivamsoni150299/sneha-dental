function normalizeBookingRef(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, '').slice(-10);
}

export function buildLegacyAppointmentLookupKey(
  clinicId: string,
  bookingRef: string,
  phone: string,
): string {
  return [clinicId.trim(), normalizeBookingRef(bookingRef), normalizePhone(phone)].join('__');
}

/**
 * Deterministic, non-reversible appointment document ID.
 *
 * Patients can still look up a booking with reference + phone, but slot
 * documents and browser history no longer expose those values in plain text.
 */
export async function buildAppointmentLookupKey(
  clinicId: string,
  bookingRef: string,
  phone: string,
): Promise<string> {
  const source = buildLegacyAppointmentLookupKey(clinicId, bookingRef, phone);
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(source),
  );
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
