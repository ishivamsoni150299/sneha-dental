import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService privacy boundary', () => {
  let service: AnalyticsService;
  let gtag: jasmine.Spy;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [AnalyticsService, { provide: Router, useValue: { events: new Subject() } }] });
    service = TestBed.inject(AnalyticsService);
    (service as any).initialised = true;
    gtag = jasmine.createSpy('gtag');
    window.gtag = gtag;
  });
  afterEach(() => { delete window.gtag; delete window.dataLayer; });

  it('sends aggregate booking events without identities or treatment information', () => {
    service.trackBookingSubmitted({ bookingRef: 'PRIVATE-123', service: 'Private treatment', clinicId: 'clinic-123', doctorName: 'Private name', consultationMode: 'video', isIndependent: true });
    const sent = JSON.stringify(gtag.calls.allArgs());
    for (const sensitive of ['PRIVATE-123', 'Private treatment', 'clinic-123', 'Private name']) expect(sent).not.toContain(sensitive);
    expect(gtag).toHaveBeenCalledWith('event', 'appointment_booked', jasmine.objectContaining({ consultation_mode: 'video', is_independent: true }));
  });
  it('drops unknown parameters and free text even from generic callers', () => {
    service.trackEvent('search', { search_term: 'private@example.test', user_name: 'Secret', cta_label: 'Secret', consultation_mode: 'Secret', results_count: 4 });
    const sent = JSON.stringify(gtag.calls.allArgs());
    expect(sent).not.toContain('Secret');
    expect(sent).not.toContain('private@example.test');
    expect(gtag).toHaveBeenCalledWith('event', 'search', jasmine.objectContaining({ results_count: 4 }));
  });
  it('removes query strings, fragments, referrers and arbitrary titles', () => {
    service.trackPageView('/dentists?email=private#token', 'Private name');
    expect(gtag).toHaveBeenCalledWith('event', 'page_view', jasmine.objectContaining({ page_path: '/dentists', page_location: `${window.location.origin  }/dentists`, page_referrer: '', page_title: 'My Dental Platform' }));
    expect(JSON.stringify(gtag.calls.allArgs())).not.toContain('private');
  });
  it('does not track account, consultation or dynamic profile pages', () => {
    for (const path of ['/my-appointment', '/video/private', '/business/admin', '/dentists/private-name']) service.trackPageView(path);
    expect(gtag).not.toHaveBeenCalled();
  });
  it('routes events only to the current tenant', () => {
    service.setClinicTrackingId('G-FIRST');
    service.setClinicTrackingId('G-SECOND');
    gtag.calls.reset();
    service.trackEvent('cta_click');
    expect(gtag.calls.mostRecent().args[2].send_to).toContain('G-SECOND');
    expect(gtag.calls.mostRecent().args[2].send_to).not.toContain('G-FIRST');
    service.setClinicTrackingId(null);
    service.trackEvent('cta_click');
    expect(gtag.calls.mostRecent().args[2].send_to).not.toContain('G-SECOND');
  });
});
