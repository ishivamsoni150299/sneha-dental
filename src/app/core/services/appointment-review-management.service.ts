import { Injectable, inject } from '@angular/core';
import { AuthenticatedApiService } from './authenticated-api.service';

export type ReviewModerationStatus = 'pending' | 'published' | 'rejected';

export interface ManagedAppointmentReview {
  id: string;
  clinicId: string;
  rating: number;
  text: string;
  patientAlias: string;
  moderationStatus: ReviewModerationStatus;
  clinicResponse: string;
  createdAt: string | null;
  publishedAt: string | null;
}

export interface AppointmentReviewReport {
  id: string;
  reviewId: string;
  clinicId: string;
  reason: string;
  details: string;
  status: 'pending' | 'resolved' | 'dismissed';
  createdAt: string | null;
  review: ManagedAppointmentReview | null;
}

@Injectable({ providedIn: 'root' })
export class AppointmentReviewManagementService {
  private readonly api = inject(AuthenticatedApiService);

  async getModerationQueue(): Promise<ManagedAppointmentReview[]> {
    return this.get<ManagedAppointmentReview[]>('/api/admin/reviews/moderation');
  }

  async getOpenReports(): Promise<AppointmentReviewReport[]> {
    return this.get<AppointmentReviewReport[]>('/api/admin/reviews/reports');
  }

  async moderate(reviewId: string, status: Exclude<ReviewModerationStatus, 'pending'>): Promise<void> {
    await this.patch(`/api/admin/reviews/${encodeURIComponent(reviewId)}/moderation`, { status });
  }

  async resolveReport(
    reportId: string,
    status: 'resolved' | 'dismissed',
    rejectReview = false,
  ): Promise<void> {
    await this.patch(`/api/admin/reviews/reports/${encodeURIComponent(reportId)}`, { status, rejectReview });
  }

  async getClinicPublishedReviews(_clinicId: string): Promise<ManagedAppointmentReview[]> {
    return this.get<ManagedAppointmentReview[]>('/api/clinics/current/reviews');
  }

  async respond(_clinicId: string, reviewId: string, response: string): Promise<void> {
    await this.patch(`/api/clinics/current/reviews/${encodeURIComponent(reviewId)}/response`, { response });
  }

  private async get<T>(url: string): Promise<T> {
    const response = await this.api.fetch(url);
    if (!response.ok) throw new Error('Review data could not be loaded.');
    return await response.json() as T;
  }

  private async patch(url: string, body: object): Promise<void> {
    const response = await this.api.fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error('Review update could not be saved.');
  }
}
