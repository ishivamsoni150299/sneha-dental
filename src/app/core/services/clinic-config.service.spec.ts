import { TestBed } from '@angular/core/testing';
import { ClinicConfigService } from './clinic-config.service';
import { AnalyticsService } from './analytics.service';

describe('Clinic review evidence', () => {
  let clinic: ClinicConfigService;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [
      { provide: AnalyticsService, useValue: { setClinicTrackingId: () => undefined } },
    ] });
    clinic = TestBed.inject(ClinicConfigService);
  });

  it('does not treat a legacy rating as a published review aggregate', () => {
    clinic.updateConfig({ rating: '4.9', ratingCount: 0, averageRating: null });
    expect(clinic.reviewRating).toBeNull();
  });

  it('shows a valid published aggregate', () => {
    clinic.updateConfig({ ratingCount: 3, averageRating: '4.6667' });
    expect(clinic.reviewRating).toBe('4.7');
  });

  it('hides invalid or missing averages even when a count is present', () => {
    clinic.updateConfig({ ratingCount: 3, averageRating: 8 });
    expect(clinic.reviewRating).toBeNull();
    clinic.updateConfig({ averageRating: null });
    expect(clinic.reviewRating).toBeNull();
  });
});