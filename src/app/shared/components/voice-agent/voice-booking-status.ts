export type RealtimeBookingPhase = 'submitting' | 'confirmed' | 'needs-details' | 'slot-taken' | 'failed';

export interface RealtimeBookingUpdate {
  phase: RealtimeBookingPhase;
  message: string;
  bookingRef?: string;
}

export interface RealtimeBookingSubmission {
  output: Record<string, unknown>;
  update: RealtimeBookingUpdate;
}

function responseText(output: Record<string, unknown>, key: string): string {
  return typeof output[key] === 'string' ? output[key].trim() : '';
}

export function normalizeRealtimeBookingUpdate(output: Record<string, unknown>): RealtimeBookingUpdate {
  const message = responseText(output, 'message');
  const bookingRef = responseText(output, 'booking_ref');
  const code = responseText(output, 'code');

  if (output['success'] === true) {
    return {
      phase: 'confirmed',
      message: message || 'Your appointment request has been received.',
      ...(bookingRef ? { bookingRef } : {}),
    };
  }

  if (code === 'missing_fields') {
    return { phase: 'needs-details', message: message || 'A few booking details are still needed.' };
  }
  if (code === 'slot_taken') {
    return { phase: 'slot-taken', message: message || 'That time is unavailable. Please choose another time.' };
  }
  return { phase: 'failed', message: message || 'The booking request could not be submitted.' };
}

export async function submitRealtimeBookingRequest(
  clinicId: string,
  sessionToken: string,
  args: Record<string, unknown>,
  request: typeof fetch = fetch,
): Promise<RealtimeBookingSubmission> {
  let output: Record<string, unknown>;
  try {
    const response = await request('/api/voice-booking-action', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Voice-Session-Token': sessionToken,
      },
      body: JSON.stringify({ ...args, clinicId }),
    });
    output = await response.json() as Record<string, unknown>;
    if (!response.ok && !output['message']) {
      output['message'] = 'The booking request could not be submitted.';
    }
  } catch {
    output = { success: false, message: 'The booking service is temporarily unavailable.' };
  }

  return { output, update: normalizeRealtimeBookingUpdate(output) };
}