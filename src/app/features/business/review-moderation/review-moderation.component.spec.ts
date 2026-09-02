import { TestBed } from '@angular/core/testing';
import {
  AppointmentReviewManagementService,
  type AppointmentReviewReport,
} from '../../../core/services/appointment-review-management.service';
import { ReviewModerationComponent } from './review-moderation.component';

function reportedReview(): AppointmentReviewReport {
  return {
    id: 'report-1',
    reviewId: 'review-1',
    clinicId: 'clinic-1',
    reason: 'privacy',
    details: 'Contains personal information.',
    status: 'pending',
    createdAt: null,
    review: {
      id: 'review-1',
      clinicId: 'clinic-1',
      rating: 2,
      text: 'The reported review text.',
      patientAlias: 'Verified patient',
      moderationStatus: 'published',
      clinicResponse: '',
      createdAt: null,
      publishedAt: null,
    },
  };
}

describe('ReviewModerationComponent', () => {
  it('shows reported content and removes the review through one moderation decision', async () => {
    const service = jasmine.createSpyObj<AppointmentReviewManagementService>(
      'AppointmentReviewManagementService',
      ['getModerationQueue', 'getOpenReports', 'moderate', 'resolveReport'],
    );
    service.getModerationQueue.and.resolveTo([]);
    service.getOpenReports.and.resolveTo([reportedReview()]);
    service.resolveReport.and.resolveTo();
    await TestBed.configureTestingModule({
      imports: [ReviewModerationComponent],
      providers: [{ provide: AppointmentReviewManagementService, useValue: service }],
    }).compileComponents();
    const fixture = TestBed.createComponent(ReviewModerationComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('The reported review text.');
    await fixture.componentInstance.resolveReport('report-1', 'resolved', true);

    expect(service.resolveReport).toHaveBeenCalledWith('report-1', 'resolved', true);
    expect(fixture.componentInstance.reports()).toEqual([]);
  });
});