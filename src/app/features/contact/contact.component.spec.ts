import { TestBed } from '@angular/core/testing';
import { ContactComponent } from './contact.component';
import { ClinicConfigService } from '../../core/services/clinic-config.service';
import { AnalyticsService } from '../../core/services/analytics.service';

describe('ContactComponent', () => {
  let component: ContactComponent;
  let request: jasmine.Spy<typeof fetch>;
  let analytics: jasmine.SpyObj<AnalyticsService>;

  beforeEach(() => {
    analytics = jasmine.createSpyObj('AnalyticsService', ['trackContactSubmitted']);
    TestBed.configureTestingModule({
      providers: [
        { provide: ClinicConfigService, useValue: { config: { clinicId: 'clinic-1', mapEmbedUrl: '' } } },
        { provide: AnalyticsService, useValue: analytics },
      ],
    });
    component = TestBed.runInInjectionContext(() => new ContactComponent());
    request = spyOn(window, 'fetch');
    component.form.setValue({ name: 'Test Patient', phone: '9999999999', email: '', message: 'Please share your opening hours.', privacyAccepted: true });
  });

  it('submits consent and clinic scope without requiring an HttpClient provider', async () => {
    request.and.resolveTo(new Response(null, { status: 204 }));
    await component.onSubmit();
    expect(request.calls.mostRecent().args[0]).toBe('/api/public/contacts');
    const options = request.calls.mostRecent().args[1]!;
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body as string)).toEqual(jasmine.objectContaining({ clinicId: 'clinic-1', consentVersion: '2026-08-29', name: 'Test Patient' }));
    expect(component.submitted()).toBeTrue();
    expect(component.submitting()).toBeFalse();
    expect(analytics.trackContactSubmitted).toHaveBeenCalledOnceWith({ clinic_id: 'clinic-1' });
  });

  it('keeps the form retryable on an HTTP failure', async () => {
    request.and.resolveTo(new Response(null, { status: 503 }));
    await component.onSubmit();
    expect(component.sendError()).toBeTrue();
    expect(component.submitted()).toBeFalse();
    expect(component.submitting()).toBeFalse();
    expect(analytics.trackContactSubmitted).not.toHaveBeenCalled();
    request.and.resolveTo(new Response(null, { status: 204 }));
    await component.onSubmit();
    expect(component.sendError()).toBeFalse();
    expect(component.submitted()).toBeTrue();
  });

  it('does not submit without consent', async () => {
    component.form.controls.privacyAccepted.setValue(false);
    await component.onSubmit();
    expect(request).not.toHaveBeenCalled();
  });
});
