import { TestBed } from '@angular/core/testing';
import { AppointmentReviewManagementService, ManagedAppointmentReview } from '../../../core/services/appointment-review-management.service';
import { ClinicConfigService } from '../../../core/services/clinic-config.service';
import { AdminReviewsComponent } from './admin-reviews.component';

describe('Clinic review publishing', () => {
  let component: AdminReviewsComponent;
  let api: jasmine.SpyObj<AppointmentReviewManagementService>;
  beforeEach(() => {
    api = jasmine.createSpyObj('Reviews', ['respond', 'getClinicPublishedReviews']);
    TestBed.configureTestingModule({ providers: [
      { provide: AppointmentReviewManagementService, useValue: api },
      { provide: ClinicConfigService, useValue: { config: { clinicId: 'clinic' } } },
    ] });
    component = TestBed.runInInjectionContext(() => new AdminReviewsComponent());
    component.editingId.set('review');
  });

  it('rejects whitespace and preserves a failed reply for correction', async () => {
    component.response.set('   ');
    await component.save('review');
    expect(api.respond).not.toHaveBeenCalled();
    expect(component.error()).toContain('2–600');
    component.response.set('Thank you for visiting.');
    api.respond.and.rejectWith(new Error('Connection lost'));
    await component.save('review');
    expect(component.editingId()).toBe('review');
    expect(component.response()).toBe('Thank you for visiting.');
    expect(component.updatingId()).toBeNull();
  });

  it('prevents overlapping edits and stores the response actually sent', async () => {
    let finish!: () => void;
    api.respond.and.returnValue(new Promise<void>(resolve => { finish = resolve; }));
    component.reviews.set([{ id: 'review', clinicResponse: '' } as ManagedAppointmentReview]);
    component.response.set('  Thank you.  ');
    const saving = component.save('review');
    component.edit({ id: 'other', clinicResponse: 'Other' } as ManagedAppointmentReview);
    await component.save('review');
    await component.load();
    expect(component.editingId()).toBe('review');
    expect(api.respond).toHaveBeenCalledOnceWith('clinic', 'review', 'Thank you.');
    expect(api.getClinicPublishedReviews).not.toHaveBeenCalled();
    finish();
    await saving;
    expect(component.reviews()[0].clinicResponse).toBe('Thank you.');
  });
});
