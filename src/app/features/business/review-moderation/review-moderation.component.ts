import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import {
  AppointmentReviewManagementService,
  type AppointmentReviewReport,
  type ManagedAppointmentReview,
} from '../../../core/services/appointment-review-management.service';

@Component({
  selector: 'app-review-moderation',
  standalone: true,
  templateUrl: './review-moderation.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewModerationComponent implements OnInit {
  private readonly reviewsApi = inject(AppointmentReviewManagementService);
  readonly reviews = signal<ManagedAppointmentReview[]>([]);
  readonly reports = signal<AppointmentReviewReport[]>([]);
  readonly loading = signal(true);
  readonly updatingId = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [reviews, reports] = await Promise.all([
        this.reviewsApi.getModerationQueue(),
        this.reviewsApi.getOpenReports(),
      ]);
      this.reviews.set(reviews);
      this.reports.set(reports);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Review moderation could not be loaded.');
    } finally {
      this.loading.set(false);
    }
  }

  async moderate(reviewId: string, status: 'published' | 'rejected'): Promise<void> {
    if (this.updatingId()) return;
    this.updatingId.set(reviewId);
    this.error.set(null);
    try {
      await this.reviewsApi.moderate(reviewId, status);
      this.reviews.update(reviews => reviews.filter(review => review.id !== reviewId));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Review status could not be updated.');
    } finally {
      this.updatingId.set(null);
    }
  }

  async resolveReport(reportId: string, status: 'resolved' | 'dismissed'): Promise<void> {
    if (this.updatingId()) return;
    this.updatingId.set(reportId);
    this.error.set(null);
    try {
      await this.reviewsApi.resolveReport(reportId, status);
      this.reports.update(reports => reports.filter(report => report.id !== reportId));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Report status could not be updated.');
    } finally {
      this.updatingId.set(null);
    }
  }
}