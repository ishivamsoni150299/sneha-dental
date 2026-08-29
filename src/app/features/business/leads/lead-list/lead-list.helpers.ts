import type { LeadStatus, StoredLead } from '../../../../core/services/lead-firestore.service';

const MANUAL_STATUS_FOLLOW_UP_DAYS: Partial<Record<LeadStatus, number>> = {
  contacted:  2,
  interested: 1,
  demo:       3,
};

const WHATSAPP_FOLLOW_UP_DAYS: Partial<Record<LeadStatus, number>> = {
  new:        2,
  contacted: 2,
  interested: 1,
  demo:       3,
};

const WHATSAPP_NEXT_STATUS: Partial<Record<LeadStatus, LeadStatus>> = {
  new: 'contacted',
};

function addDaysIso(now: Date, daysAhead: number): string {
  const d = new Date(now);
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().split('T')[0];
}

export function buildManualLeadStatusUpdate(
  lead: Pick<StoredLead, 'followUpDate'>,
  status: LeadStatus,
  now = new Date(),
): Partial<StoredLead> {
  const updates: Partial<StoredLead> = { status };
  const daysAhead = MANUAL_STATUS_FOLLOW_UP_DAYS[status];

  if (daysAhead && !lead.followUpDate) {
    updates.followUpDate = addDaysIso(now, daysAhead);
  }

  return updates;
}

export function buildWhatsAppLeadContactUpdate(
  lead: Pick<StoredLead, 'status'>,
  now = new Date(),
): Partial<StoredLead> {
  const next = WHATSAPP_NEXT_STATUS[lead.status];
  const daysAhead = WHATSAPP_FOLLOW_UP_DAYS[lead.status] ?? 2;

  return {
    followUpDate: addDaysIso(now, daysAhead),
    ...(next ? { status: next } : {}),
  };
}
