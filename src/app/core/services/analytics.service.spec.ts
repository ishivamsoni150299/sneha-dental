import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  let routerEvents$: Subject<unknown>;
  let mockRouter: Partial<Router>;

  beforeEach(() => {
    routerEvents$ = new Subject<unknown>();
    mockRouter = {
      events: routerEvents$.asObservable() as any,
    };
    window.dataLayer = [];
    window.gtag = jasmine.createSpy('gtag');

    TestBed.configureTestingModule({
      providers: [
        AnalyticsService,
        { provide: Router, useValue: mockRouter },
      ],
    });
  });

  afterEach(() => {
    delete (window as any).gtag;
    delete (window as any).dataLayer;
  });

  it('initializes service cleanly in browser environment', () => {
    const service = TestBed.inject(AnalyticsService);
    expect(service).toBeTruthy();
  });

  it('tracks custom event with parameter dictionary', () => {
    const service = TestBed.inject(AnalyticsService);
    // simulate initialised state
    (service as any).initialised = true;

    service.trackEvent('test_event', { key: 'value', number: 42 });
    expect(window.gtag).toHaveBeenCalledWith('event', 'test_event', { key: 'value', number: 42 });
  });

  it('tracks custom event with legacy category and label parameters', () => {
    const service = TestBed.inject(AnalyticsService);
    (service as any).initialised = true;

    service.trackEvent('click', 'engagement', 'Hero Button', 10);
    expect(window.gtag).toHaveBeenCalledWith('event', 'click', {
      event_category: 'engagement',
      event_label: 'Hero Button',
      value: 10,
    });
  });

  it('tracks page views on manual trigger', () => {
    const service = TestBed.inject(AnalyticsService);
    (service as any).initialised = true;

    service.trackPageView('/dentists/noida', 'Dentists in Noida');
    expect(window.gtag).toHaveBeenCalledWith('event', 'page_view', {
      page_path: '/dentists/noida',
      page_title: 'Dentists in Noida',
    });
  });

  it('tracks high-value booking submission conversion', () => {
    const service = TestBed.inject(AnalyticsService);
    (service as any).initialised = true;

    service.trackBookingSubmitted({
      bookingRef: 'SD-TEST99',
      service: 'Root Canal Treatment',
      clinicId: 'clinic-123',
      consultationMode: 'video',
      doctorName: 'Dr. Sharma',
      isIndependent: true,
    });

    expect(window.gtag).toHaveBeenCalledWith('event', 'generate_lead', jasmine.objectContaining({
      lead_type: 'appointment_booking',
      booking_ref: 'SD-TEST99',
      service: 'Root Canal Treatment',
      consultation_mode: 'video',
    }));

    expect(window.gtag).toHaveBeenCalledWith('event', 'appointment_booked', jasmine.objectContaining({
      booking_ref: 'SD-TEST99',
      is_independent: true,
    }));
  });

  it('sets and updates multi-tenant clinic tracking ID', () => {
    const service = TestBed.inject(AnalyticsService);
    (service as any).initialised = true;

    service.setClinicTrackingId('G-CLINIC123');
    expect(window.gtag).toHaveBeenCalledWith('config', 'G-CLINIC123', { send_page_view: false });
  });

  it('ignores invalid clinic tracking IDs', () => {
    const service = TestBed.inject(AnalyticsService);
    (service as any).initialised = true;

    service.setClinicTrackingId('invalid-id');
    expect((service as any).clinicTrackingId).toBeNull();
  });
});
