import { Injectable, inject } from '@angular/core';
import { DEFAULT_BOOKING_SLOTS } from './doctor.service';
import { maskPatientPhone, PatientAuthService } from './patient-auth.service';

export interface PatientAppointmentReview {
  id: string;
  rating: number;
  text: string;
  patientAlias: string;
  moderationStatus: 'pending' | 'published' | 'rejected';
  clinicResponse: string;
  createdAt: string | null;
  publishedAt: string | null;
  clinicRespondedAt: string | null;
}

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
  doctorId?: string | null;
  status: string;
  cancellationReason: string;
  confirmationDeadline: string | null;
  confirmationRespondedAt: string | null;
  confirmedAt: string | null;
  declinedAt: string | null;
  expiredAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  review: PatientAppointmentReview | null;
}

export interface PatientSession {
  profile: { phoneMasked: string };
  appointments: PatientAppointmentSummary[];
}

@Injectable({ providedIn: 'root' })
export class PatientAppointmentApiService {
  private readonly patientAuth = inject(PatientAuthService);
  private readonly cache = new Map<string, PatientAppointmentSummary>();

  async session(): Promise<PatientSession> {
    const phone = this.phone();
    const references = this.references();
    const settled = await Promise.allSettled(references.map(reference => this.lookup(reference, phone)));
    const appointments = settled
      .filter((result): result is PromiseFulfilledResult<PatientAppointmentSummary> => result.status === 'fulfilled')
      .map(result => result.value);
    return { profile: { phoneMasked: maskPatientPhone(phone) }, appointments };
  }

  async claim(bookingRef: string): Promise<PatientAppointmentSummary> {
    const appointment = await this.lookup(bookingRef, this.phone());
    const references = new Set(this.references());
    references.add(appointment.bookingRef);
    globalThis.localStorage?.setItem('patient-booking-references', JSON.stringify([...references]));
    return appointment;
  }

  async cancel(appointmentId: string): Promise<PatientAppointmentSummary> {
    await this.request(`/api/public/appointments/${encodeURIComponent(appointmentId)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ phone: this.phone() }),
    });
    return this.updateCached(appointmentId, { status: 'cancelled' });
  }

  async availability(appointmentId: string, date: string): Promise<string[]> {
    const appointment = this.requireCached(appointmentId);
    if (!appointment.doctorId) return DEFAULT_BOOKING_SLOTS;
    return this.request<string[]>(
      `/api/public/clinics/${encodeURIComponent(appointment.clinicId)}/doctors/${encodeURIComponent(appointment.doctorId)}/slots?date=${encodeURIComponent(date)}`,
    );
  }

  async reschedule(appointmentId: string, date: string, time: string): Promise<PatientAppointmentSummary> {
    const appointment = this.requireCached(appointmentId);
    await this.request(`/api/public/appointments/${encodeURIComponent(appointmentId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ phone: this.phone(), date, time }),
    });
    return this.lookup(appointment.bookingRef, this.phone());
  }

  async submitReview(
    appointmentId: string,
    rating: number,
    text: string,
    anonymous: boolean,
  ): Promise<PatientAppointmentReview> {
    return this.request<PatientAppointmentReview>(`/api/public/appointments/${encodeURIComponent(appointmentId)}/review`, {
      method: 'POST',
      body: JSON.stringify({ phone: this.phone(), rating, text, anonymous }),
    });
  }

  async reportReview(reviewId: string, reason: string, details: string): Promise<void> {
    await this.request(`/api/public/reviews/${encodeURIComponent(reviewId)}/reports`, {
      method: 'POST',
      body: JSON.stringify({ phone: this.phone(), reason, details }),
    });
  }

  private async lookup(bookingRef: string, phone: string): Promise<PatientAppointmentSummary> {
    const appointment = await this.request<PatientAppointmentSummary>('/api/public/appointments/lookup-any', {
      method: 'POST',
      body: JSON.stringify({ bookingRef, phone }),
    });
    this.cache.set(appointment.id, appointment);
    return appointment;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init.headers },
    });
    const payload = await response.json().catch(() => ({})) as T & { detail?: string; message?: string };
    if (!response.ok) throw new Error(payload.detail || payload.message || 'Patient appointments are temporarily unavailable.');
    return payload;
  }

  private phone(): string {
    const phone = this.patientAuth.user()?.phoneNumber;
    if (!phone) throw new Error('Enter the mobile number used for the booking.');
    return phone;
  }

  private references(): string[] {
    try {
      const value = JSON.parse(globalThis.localStorage?.getItem('patient-booking-references') ?? '[]');
      return Array.isArray(value) ? value.filter(reference => typeof reference === 'string').slice(0, 50) : [];
    } catch {
      return [];
    }
  }

  private requireCached(appointmentId: string): PatientAppointmentSummary {
    const appointment = this.cache.get(appointmentId);
    if (!appointment) throw new Error('Reload this appointment and try again.');
    return appointment;
  }

  private updateCached(appointmentId: string, update: Partial<PatientAppointmentSummary>): PatientAppointmentSummary {
    const appointment = { ...this.requireCached(appointmentId), ...update };
    this.cache.set(appointmentId, appointment);
    return appointment;
  }
}