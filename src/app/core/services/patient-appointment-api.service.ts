import { Injectable, inject } from '@angular/core';
import { AuthenticatedApiService } from './authenticated-api.service';

export interface PatientAppointmentSummary {
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

export interface PatientSession {
  profile: { phoneMasked: string };
  appointments: PatientAppointmentSummary[];
}

@Injectable({ providedIn: 'root' })
export class PatientAppointmentApiService {
  private readonly api = inject(AuthenticatedApiService);

  session(): Promise<PatientSession> {
    return this.request<PatientSession>('session');
  }

  async claim(bookingRef: string): Promise<PatientAppointmentSummary> {
    const response = await this.request<{ appointment: PatientAppointmentSummary }>('claim', { bookingRef });
    return response.appointment;
  }

  async cancel(appointmentId: string): Promise<PatientAppointmentSummary> {
    const response = await this.request<{ appointment: PatientAppointmentSummary }>('cancel', { appointmentId });
    return response.appointment;
  }

  async availability(appointmentId: string, date: string): Promise<string[]> {
    const response = await this.request<{ slots: string[] }>('availability', { appointmentId, date });
    return response.slots;
  }

  async reschedule(appointmentId: string, date: string, time: string): Promise<PatientAppointmentSummary> {
    const response = await this.request<{ appointment: PatientAppointmentSummary }>('reschedule', {
      appointmentId,
      date,
      time,
    });
    return response.appointment;
  }

  private async request<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
    const response = await this.api.fetch(`/api/patient?action=${encodeURIComponent(action)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({})) as T & { error?: string };
    if (!response.ok) throw new Error(payload.error || 'Patient appointments are temporarily unavailable.');
    return payload;
  }
}