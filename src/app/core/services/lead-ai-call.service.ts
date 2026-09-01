import { Injectable, inject } from '@angular/core';
import { AuthenticatedApiService } from './authenticated-api.service';

export interface QueueLeadAiCallRequest {
  leadId: string;
  consentConfirmed: true;
  consentSource: string;
  timing: 'now' | 'scheduled';
  scheduledFor?: string;
}

export interface QueueLeadAiCallResponse {
  ok: true;
  callId: string;
  provider: string;
  status: 'scheduled' | 'queued';
  timing: 'now' | 'scheduled';
  callAt: string;
  scheduledFor?: string;
  consentAt: string;
  attempts: number;
}

export interface ControlLeadAiCallResponse {
  ok: true;
  status: 'cancelled' | 'opted_out' | 'ready';
  providerCallCancelled: boolean;
  consentAt?: string;
}

@Injectable({ providedIn: 'root' })
export class LeadAiCallService {
  private api = inject(AuthenticatedApiService);

  async queue(request: QueueLeadAiCallRequest): Promise<QueueLeadAiCallResponse> {
    const response = await this.api.fetch('/api/lead-ai-call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'queue', ...request }),
    });
    const payload = await response.json().catch(() => ({})) as Partial<QueueLeadAiCallResponse> & { error?: string };
    if (!response.ok) throw new Error(payload.error || 'Could not queue the AI call.');
    return payload as QueueLeadAiCallResponse;
  }

  async cancel(leadId: string, reason: string): Promise<ControlLeadAiCallResponse> {
    return this.control('cancel', leadId, reason);
  }

  async doNotCall(leadId: string, reason: string): Promise<ControlLeadAiCallResponse> {
    return this.control('do_not_call', leadId, reason);
  }

  async recordConsent(leadId: string, evidence: string): Promise<ControlLeadAiCallResponse> {
    return this.control('record_consent', leadId, evidence);
  }

  private async control(
    action: 'cancel' | 'do_not_call' | 'record_consent',
    leadId: string,
    reason: string,
  ): Promise<ControlLeadAiCallResponse> {
    const response = await this.api.fetch('/api/lead-ai-call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, leadId, reason }),
    });
    const payload = await response.json().catch(() => ({})) as Partial<ControlLeadAiCallResponse> & { error?: string };
    if (!response.ok) throw new Error(payload.error || 'Could not update the AI call.');
    return payload as ControlLeadAiCallResponse;
  }
}