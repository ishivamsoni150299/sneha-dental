import { Injectable, inject } from '@angular/core';
import { AuthenticatedApiService } from './authenticated-api.service';

export type LeadStatus = 'new' | 'contacted' | 'interested' | 'demo' | 'converted' | 'lost';
export type LeadSource = 'google_maps' | 'instagram' | 'referral' | 'ida' | 'walkin' | 'other';
export type LeadCallConsent = 'unknown' | 'granted' | 'revoked';
export type LeadAiCallStatus =
  | 'not_ready'
  | 'ready'
  | 'preparing'
  | 'scheduled'
  | 'queued'
  | 'ringing'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'opted_out';
export type LeadAiCallOutcome =
  | 'interested'
  | 'demo_booked'
  | 'callback_requested'
  | 'not_interested'
  | 'no_answer'
  | 'voicemail'
  | 'wrong_number'
  | 'opted_out'
  | 'unknown';
export type ActivityType = 'whatsapp' | 'called' | 'ai_call' | 'note' | 'status_change';

export interface StoredLead {
  id:           string;
  clinicName:   string;
  doctorName:   string;
  phone:        string;
  city:         string;
  source:       LeadSource;
  status:       LeadStatus;
  followUpDate?: string;
  notes?:       string;
  referredBy?:  string;
  // Enriched from Google Maps CSV
  address?:     string;   // Full address from Google Maps
  area?:        string;   // Area / Neighbourhood
  rating?:      number;   // Google star rating (0–5)
  reviewCount?: number;   // Total review count
  categories?:  string;   // Clinic type (e.g. "Dental clinic, Dentist")
  mapsLink?:    string;   // Direct Google Maps URL (used as dedup key)
  whatsappTemplateLabel?: string;
  whatsappMessage?: string;
  callConsent?: LeadCallConsent;
  callConsentSource?: string;
  callConsentAt?: string;
  doNotCall?: boolean;
  lastContactedAt?: string;
  aiCallStatus?: LeadAiCallStatus;
  aiCallScheduledFor?: string;
  aiCallProvider?: string;
  aiCallProviderId?: string;
  aiCallRequestId?: string;
  aiCallPreparedAt?: string;
  aiCallAttempts?: number;
  aiCallLastAttemptAt?: string;
  aiCallLastOutcome?: LeadAiCallOutcome;
  aiCallSummary?: string;
  aiCallError?: string;
  createdAt?:   string;
}

export interface LeadActivity {
  id:        string;
  type:      ActivityType;
  note:      string;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class LeadApiService {
  private readonly api = inject(AuthenticatedApiService);

  async getAll(): Promise<StoredLead[]> {
    return this.get<StoredLead[]>('/api/admin/leads');
  }

  async getById(id: string): Promise<StoredLead | null> {
    const response = await this.api.fetch(`/api/admin/leads/${encodeURIComponent(id)}`);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('Lead could not be loaded.');
    return await response.json() as StoredLead;
  }

  async create(data: Omit<StoredLead, 'id' | 'createdAt'>): Promise<string> {
    const response = await this.api.fetch('/api/admin/leads', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Lead could not be created.');
    return (await response.json() as { id: string }).id;
  }

  async update(id: string, data: Partial<Omit<StoredLead, 'id' | 'createdAt'>>): Promise<void> {
    await this.write(`/api/admin/leads/${encodeURIComponent(id)}`, 'PATCH', data);
  }

  async remove(id: string): Promise<void> {
    await this.write(`/api/admin/leads/${encodeURIComponent(id)}`, 'DELETE');
  }

  // ── Activities subcollection ───────────────────────────────────────────────
  async getActivities(leadId: string): Promise<LeadActivity[]> {
    return this.get<LeadActivity[]>(`/api/admin/leads/${encodeURIComponent(leadId)}/activities`);
  }

  async addActivity(leadId: string, data: Omit<LeadActivity, 'id' | 'createdAt'>): Promise<void> {
    await this.write(`/api/admin/leads/${encodeURIComponent(leadId)}/activities`, 'POST', data);
  }

  private async get<T>(url: string): Promise<T> {
    const response = await this.api.fetch(url);
    if (!response.ok) throw new Error('Lead data could not be loaded.');
    return await response.json() as T;
  }

  private async write(url: string, method: string, body?: object): Promise<void> {
    const response = await this.api.fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw new Error('Lead update could not be saved.');
  }
}
