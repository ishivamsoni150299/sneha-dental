import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  AppointmentReviewManagementService,
  type ManagedAppointmentReview,
} from '../../../core/services/appointment-review-management.service';
import { ClinicConfigService } from '../../../core/services/clinic-config.service';
import { ClinicAccountMenuComponent } from '../../../shared/components/clinic-account-menu/clinic-account-menu.component';

@Component({
  selector: 'app-admin-reviews',
  standalone: true,
  imports: [FormsModule, RouterLink, ClinicAccountMenuComponent],
  templateUrl: './admin-reviews.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminReviewsComponent implements OnInit {
  private readonly reviewsApi = inject(AppointmentReviewManagementService);
  readonly clinic = inject(ClinicConfigService);
  readonly reviews = signal<ManagedAppointmentReview[]>([]);
  readonly loading = signal(true);
  readonly editingId = signal<string | null>(null);
  readonly updatingId = signal<string | null>(null);
  readonly response = signal('');
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const clinicId = this.clinic.config.clinicId;
      if (!clinicId) throw new Error('Clinic workspace is unavailable.');
      this.reviews.set(await this.reviewsApi.getClinicPublishedReviews(clinicId));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Patient reviews could not be loaded.');
    } finally {
      this.loading.set(false);
    }
  }

  edit(review: ManagedAppointmentReview): void {
    this.editingId.set(review.id);
    this.response.set(review.clinicResponse);
    this.message.set(null);
  }

  async save(reviewId: string): Promise<void> {
    if (this.updatingId()) return;
    this.updatingId.set(reviewId);
    this.error.set(null);
    try {
      const clinicId = this.clinic.config.clinicId;
      if (!clinicId) throw new Error('Clinic workspace is unavailable.');
      await this.reviewsApi.respond(clinicId, reviewId, this.response());
      this.reviews.update(reviews => reviews.map(review => review.id === reviewId
        ? { ...review, clinicResponse: this.response().trim() }
        : review));
      this.editingId.set(null);
      this.message.set('Response published.');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Response could not be published.');
    } finally {
      this.updatingId.set(null);
    }
  }
}