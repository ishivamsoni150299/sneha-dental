import { TestBed } from '@angular/core/testing';
import { BookingOtpComponent } from './booking-otp.component';
import { AnalyticsService } from '../../core/services/analytics.service';

describe('booking mobile verification', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [BookingOtpComponent], providers: [{ provide: AnalyticsService, useValue: { trackEvent: jasmine.createSpy() } }] }));
  it('blocks submission until verification and invalidates proof when the phone changes', async () => {
    spyOn(globalThis, 'fetch').and.callFake(async url => new Response(JSON.stringify(String(url).endsWith('/verify') ? { proof: 'temporary-proof' } : { required: true, available: true }), { status: 200 }));
    const fixture = TestBed.createComponent(BookingOtpComponent); fixture.componentRef.setInput('phone', '9999999999');
    fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.componentInstance.canSubmit()).toBeFalse();
    await fixture.componentInstance.send(); fixture.componentInstance.code.set('123456'); await fixture.componentInstance.verify();
    expect(fixture.componentInstance.canSubmit()).toBeTrue();
    fixture.componentRef.setInput('phone', '8888888888'); fixture.detectChanges();
    expect(fixture.componentInstance.canSubmit()).toBeFalse(); expect(fixture.componentInstance.proof()).toBe('');
  });
  it('fails closed when verification settings cannot be loaded', async () => {
    spyOn(globalThis, 'fetch').and.resolveTo(new Response('{}', { status: 503 }));
    const fixture = TestBed.createComponent(BookingOtpComponent); fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.componentInstance.canSubmit()).toBeFalse();
  });
});
