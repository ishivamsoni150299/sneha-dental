export const AI_CALL_MAX_ATTEMPTS = 3;
export const AI_CALL_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const AI_CALL_MIN_LEAD_MS = 10 * 60 * 1000;
export const AI_CALL_MAX_LEAD_MS = 30 * 24 * 60 * 60 * 1000;
export const AI_CALL_PROVIDER_WINDOW_MS = 15 * 60 * 1000;

export type LeadCallStatus =
  | 'preparing'
  | 'scheduled'
  | 'queued'
  | 'ringing'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'opted_out';

export type LeadCallOutcome =
  | 'interested'
  | 'demo_booked'
  | 'callback_requested'
  | 'not_interested'
  | 'no_answer'
  | 'voicemail'
  | 'wrong_number'
  | 'opted_out'
  | 'unknown';

interface QueuePolicyLead {
  status?: unknown;
  doNotCall?: unknown;
  callConsent?: unknown;
  aiCallStatus?: unknown;
  aiCallAttempts?: unknown;
  aiCallLastAttemptAt?: unknown;
}

export interface ScheduleValidation {
  ok: boolean;
  scheduledAt?: Date;
  error?: string;
}

function indiaCallingWindowError(atMs: number): string {
  const indiaTime = new Date(atMs + 330 * 60 * 1000);
  const day = indiaTime.getUTCDay();
  const minuteOfDay = indiaTime.getUTCHours() * 60 + indiaTime.getUTCMinutes();
  return day === 0 || minuteOfDay < 9 * 60 || minuteOfDay >= 19 * 60
    ? 'Calls are available Monday-Saturday between 9:00 AM and 7:00 PM India time.'
    : '';
}

function timestampMs(value: unknown): number | null {
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === 'object' && 'toDate' in value) {
    const toDate = (value as { toDate?: unknown }).toDate;
    if (typeof toDate === 'function') {
      const parsed = (toDate as () => Date)().getTime();
      return Number.isFinite(parsed) ? parsed : null;
    }
  }
  return null;
}

export function normalizeIndianPhone(value: unknown): string {
  if (typeof value !== 'string') return '';
  let digits = value.replace(/\D/g, '');
  if ((digits.length === 11 || digits.length === 13) && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  if (digits.length === 10 && /^[1-9]/.test(digits)) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91') && /^[1-9]/.test(digits.slice(2))) {
    return `+${digits}`;
  }
  return '';
}

export function validateCallSchedule(value: unknown, nowMs = Date.now()): ScheduleValidation {
  if (typeof value !== 'string') return { ok: false, error: 'Choose a call date and time.' };
  const scheduledMs = new Date(value).getTime();
  if (!Number.isFinite(scheduledMs)) return { ok: false, error: 'Choose a valid call date and time.' };
  if (scheduledMs < nowMs + AI_CALL_MIN_LEAD_MS) {
    return { ok: false, error: 'Schedule calls at least 10 minutes ahead.' };
  }
  if (scheduledMs > nowMs + AI_CALL_MAX_LEAD_MS) {
    return { ok: false, error: 'Schedule calls no more than 30 days ahead.' };
  }

  const callingWindowError = indiaCallingWindowError(scheduledMs);
  if (callingWindowError) {
    return { ok: false, error: callingWindowError.replace('Calls are available', 'Choose') };
  }

  return { ok: true, scheduledAt: new Date(scheduledMs) };
}

export function validateImmediateCall(nowMs = Date.now()): ScheduleValidation {
  const callingWindowError = indiaCallingWindowError(nowMs);
  return callingWindowError
    ? { ok: false, error: callingWindowError }
    : { ok: true, scheduledAt: new Date(nowMs) };
}

export function latestCallAttemptAt(scheduledAt: Date): string {
  const scheduledMs = scheduledAt.getTime();
  const indiaTime = new Date(scheduledMs + 330 * 60 * 1000);
  const indiaCutoffMs = Date.UTC(
    indiaTime.getUTCFullYear(),
    indiaTime.getUTCMonth(),
    indiaTime.getUTCDate(),
    19,
  ) - 330 * 60 * 1000 - 1;
  return new Date(Math.min(scheduledMs + AI_CALL_PROVIDER_WINDOW_MS, indiaCutoffMs)).toISOString();
}

export function providerSchedulePlan(
  timing: 'now' | 'scheduled',
  callAt: Date,
): { earliestAt: string; latestAt: string } | undefined {
  return timing === 'scheduled'
    ? { earliestAt: callAt.toISOString(), latestAt: latestCallAttemptAt(callAt) }
    : undefined;
}

export function providerEventMatchesCall(
  currentCallId: unknown,
  currentRequestId: unknown,
  eventCallId: unknown,
  eventRequestId: unknown,
): boolean {
  const currentCall = typeof currentCallId === 'string' ? currentCallId.trim() : '';
  const currentRequest = typeof currentRequestId === 'string' ? currentRequestId.trim() : '';
  const eventCall = typeof eventCallId === 'string' ? eventCallId.trim() : '';
  const eventRequest = typeof eventRequestId === 'string' ? eventRequestId.trim() : '';
  return (!!eventCall && currentCall === eventCall)
    || (!!eventRequest && currentRequest === eventRequest);
}

export function queuePolicyBlockReason(
  lead: QueuePolicyLead,
  scheduledAtMs: number,
): string {
  if (lead.status === 'converted' || lead.status === 'lost') {
    return 'Closed leads cannot be queued for AI calls.';
  }
  if (lead.doNotCall === true || lead.callConsent === 'revoked' || lead.aiCallStatus === 'opted_out') {
    return 'This lead is marked do not call.';
  }
  if (['preparing', 'scheduled', 'queued', 'ringing', 'in_progress'].includes(String(lead.aiCallStatus ?? ''))) {
    return 'This lead already has an active AI call.';
  }
  const attempts = typeof lead.aiCallAttempts === 'number' && Number.isFinite(lead.aiCallAttempts)
    ? lead.aiCallAttempts
    : 0;
  if (attempts >= AI_CALL_MAX_ATTEMPTS) return 'This lead has reached the 3-call attempt limit.';

  const lastAttemptMs = timestampMs(lead.aiCallLastAttemptAt);
  if (lastAttemptMs !== null && scheduledAtMs - lastAttemptMs < AI_CALL_COOLDOWN_MS) {
    return 'Leave at least 24 hours between AI call attempts.';
  }
  return '';
}

export function mapProviderCallStatus(value: unknown): LeadCallStatus | '' {
  const status = typeof value === 'string' ? value.trim().toLowerCase() : '';
  const statuses: Record<string, LeadCallStatus> = {
    scheduled: 'scheduled',
    queued: 'queued',
    ringing: 'ringing',
    'in-progress': 'in_progress',
    in_progress: 'in_progress',
    forwarding: 'in_progress',
    ended: 'completed',
    completed: 'completed',
    failed: 'failed',
    cancelled: 'cancelled',
    canceled: 'cancelled',
  };
  return statuses[status] ?? '';
}

export function advanceCallStatus(current: unknown, next: LeadCallStatus): LeadCallStatus {
  const ranks: Record<string, number> = {
    preparing: 0,
    scheduled: 1,
    queued: 2,
    ringing: 3,
    in_progress: 4,
    completed: 5,
    failed: 5,
    cancelled: 5,
    opted_out: 6,
  };
  const currentStatus = typeof current === 'string' ? current : '';
  if (['completed', 'failed', 'cancelled', 'opted_out'].includes(currentStatus)) {
    return currentStatus as LeadCallStatus;
  }
  return (ranks[next] ?? -1) >= (ranks[currentStatus] ?? -1)
    ? next
    : currentStatus as LeadCallStatus;
}

export function deriveCallOutcome(
  rawOutcome: unknown,
  endedReason: unknown,
  transcript: unknown,
): LeadCallOutcome {
  const normalized = typeof rawOutcome === 'string'
    ? rawOutcome.trim().toLowerCase().replace(/[\s-]+/g, '_')
    : '';
  const aliases: Record<string, LeadCallOutcome> = {
    interested: 'interested',
    demo_booked: 'demo_booked',
    appointment_booked: 'demo_booked',
    callback_requested: 'callback_requested',
    call_back: 'callback_requested',
    not_interested: 'not_interested',
    no_answer: 'no_answer',
    voicemail: 'voicemail',
    wrong_number: 'wrong_number',
    opted_out: 'opted_out',
    do_not_call: 'opted_out',
  };
  if (aliases[normalized]) return aliases[normalized];

  if (typeof transcript === 'string') {
    const customerLines = transcript
      .split(/\r?\n/)
      .filter(line => /^(user|customer):/i.test(line.trim()))
      .join(' ');
    if (/\b(do not call|stop calling|remove (my|this) number|opt me out)\b/i.test(customerLines)) {
      return 'opted_out';
    }
  }

  const reason = typeof endedReason === 'string'
    ? endedReason.trim().toLowerCase().replace(/[\s_]+/g, '-')
    : '';
  if (reason.includes('voicemail')) return 'voicemail';
  if (reason.includes('misdialed') || reason.includes('invalid-number') || reason.includes('wrong-number')) {
    return 'wrong_number';
  }
  if (reason.includes('no-answer') || reason.includes('did-not-answer') || reason.includes('busy')) {
    return 'no_answer';
  }
  return 'unknown';
}