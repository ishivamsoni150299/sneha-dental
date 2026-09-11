import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export interface BookingEventParams {
  bookingRef?: string;
  booking_ref?: string;
  service: string;
  clinicId?: string;
  clinic_id?: string;
  consultationMode?: string;
  consultation_mode?: string;
  doctorName?: string;
  doctor_name?: string;
  isIndependent?: boolean;
  is_independent?: boolean;
}

export interface BeginBookingParams {
  service?: string;
  clinicId?: string;
  clinic_id?: string;
  doctorName?: string;
  doctor_name?: string;
  consultationMode?: string;
  consultation_mode?: string;
  source?: string;
}

/**
 * Google Analytics GA4 (gtag.js) service.
 *
 * - Supports platform-wide GA4 property (environment.gaTrackingId) and clinic-specific GA4 properties (multi-tenant).
 * - Implements Google Consent Mode v2 with privacy-safe defaults.
 * - Auto-tracks page views on every route change.
 * - Standardized event dictionary support + backward compatible (name, category, label, value).
 * - Specialized helpers for high-value conversions (appointments, WhatsApp, calls, contact).
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly router = inject(Router);
  private readonly platformTrackingId = (environment.gaTrackingId || '').trim();
  private clinicTrackingId: string | null = null;
  private initialised = false;
  private scriptLoading = false;

  constructor() {
    if (!this.isBrowser) {
      return; // SSR or Prerender - skip browser script injection.
    }

    if (this.platformTrackingId) {
      this.ensureScriptLoaded(this.platformTrackingId);
    }
    this.listenToRouteChanges();
  }

  // ── Multi-Tenant Tracking ID Management ────────────────────────────────────

  /**
   * Set or update a clinic-specific GA4 Measurement ID at runtime.
   * Enables clinic owners to view traffic and conversions for their clinic in their own GA4 property.
   */
  setClinicTrackingId(trackingId: string | null | undefined): void {
    if (!this.isBrowser) return;

    const normalized = (trackingId || '').trim();
    if (!normalized || !/^G-[A-Z0-9]+$/i.test(normalized)) {
      this.clinicTrackingId = null;
      return;
    }

    if (this.clinicTrackingId === normalized) {
      return;
    }

    this.clinicTrackingId = normalized;

    if (this.initialised) {
      this.gtag('config', normalized, { send_page_view: false });
    } else {
      this.ensureScriptLoaded(normalized);
    }
  }

  // ── Event Tracking API ─────────────────────────────────────────────────────

  /**
   * Send a custom GA4 event using either a full parameter dictionary or legacy positional arguments.
   *
   * @example
   *   analytics.trackEvent('appointment_booked', { booking_ref: 'SD-1234', service: 'Root Canal' });
   *   analytics.trackEvent('whatsapp_click', 'engagement', 'Floating Button');
   */
  trackEvent(
    eventName: string,
    categoryOrParams?: string | Record<string, unknown>,
    label?: string,
    value?: number,
  ): void {
    const params: Record<string, unknown> = typeof categoryOrParams === 'object' && categoryOrParams !== null
      ? { ...categoryOrParams }
      : {
          ...(categoryOrParams ? { event_category: categoryOrParams } : {}),
          ...(label ? { event_label: label } : {}),
          ...(value !== undefined ? { value } : {}),
        };

    if (!environment.production) {
      console.info(`[GA4 Event] ${eventName}`, params);
    }

    if (!this.initialised) return;
    this.gtag('event', eventName, params);
  }

  /** Manually track a page view (auto-tracked on route change already). */
  trackPageView(path: string, title?: string): void {
    const pageParams = {
      page_path: path,
      page_title: title ?? (typeof document !== 'undefined' ? document.title : ''),
    };

    if (!environment.production) {
      console.info('[GA4 PageView]', pageParams);
    }

    if (!this.initialised) return;
    this.gtag('event', 'page_view', pageParams);
  }

  // ── High-Value Conversion Helpers ──────────────────────────────────────────

  /** Track when an appointment request is successfully submitted. */
  trackBookingSubmitted(details: BookingEventParams): void {
    const bookingRef = details.bookingRef ?? details.booking_ref ?? '';
    const clinicId = details.clinicId ?? details.clinic_id;
    const consultationMode = details.consultationMode ?? details.consultation_mode ?? 'in_person';
    const doctorName = details.doctorName ?? details.doctor_name;
    const isIndependent = Boolean(details.isIndependent ?? details.is_independent);

    const eventParams: Record<string, unknown> = {
      booking_ref: bookingRef,
      service: details.service,
      ...(clinicId ? { clinic_id: clinicId } : {}),
      consultation_mode: consultationMode,
      ...(doctorName ? { doctor_name: doctorName } : {}),
      is_independent: isIndependent,
    };
    // Send standard GA4 conversion event 'generate_lead' and custom 'appointment_booked'
    this.trackEvent('generate_lead', {
      currency: 'INR',
      lead_type: 'appointment_booking',
      ...eventParams,
    });
    this.trackEvent('appointment_booked', eventParams);
  }

  /** Track when a user begins the booking flow. */
  trackBeginBooking(details?: BeginBookingParams): void {
    this.trackEvent('begin_booking', {
      service: details?.service,
      clinic_id: details?.clinicId ?? details?.clinic_id,
      doctor_name: details?.doctorName ?? details?.doctor_name,
      consultation_mode: details?.consultationMode ?? details?.consultation_mode,
      source: details?.source,
    });
  }

  /** Track CTA interactions (WhatsApp, Call, Book Appointment, Map directions). */
  trackCtaClick(
    action: 'book_appointment' | 'whatsapp' | 'call' | 'directions' | 'add_to_calendar',
    location: string,
    label?: string,
  ): void {
    this.trackEvent('cta_click', {
      cta_action: action,
      cta_location: location,
      cta_label: label,
      event_category: 'engagement',
    });
  }

  /** Track when a contact form is submitted. */
  trackContactSubmitted(details: { clinicId?: string; clinic_id?: string; name?: string }): void {
    this.trackEvent('contact_form_submit', {
      clinic_id: details.clinicId ?? details.clinic_id,
      user_name: details.name,
      lead_type: 'contact_enquiry',
    });
  }

  /** Track marketplace search and discovery. */
  trackMarketplaceSearch(
    queryOrDetails: string | { search_term?: string; searchTerm?: string; region?: string; locality?: string; service?: string; results_count?: number; resultsCount?: number },
    region?: string,
    locality?: string,
  ): void {
    if (typeof queryOrDetails === 'object' && queryOrDetails !== null) {
      this.trackEvent('search', {
        search_term: queryOrDetails.search_term ?? queryOrDetails.searchTerm ?? '',
        region: queryOrDetails.region ?? 'delhi-ncr',
        locality: queryOrDetails.locality,
        service: queryOrDetails.service,
        results_count: queryOrDetails.results_count ?? queryOrDetails.resultsCount,
      });
      return;
    }
    this.trackEvent('search', {
      search_term: queryOrDetails,
      region,
      locality,
    });
  }

  /** Track dentist profile page view. */
  trackDentistProfileView(
    slugOrDetails: string | { dentist_id?: string; dentistId?: string; slug?: string; clinicName?: string; dentist_name?: string; locality?: string; city?: string; is_independent?: boolean; isIndependent?: boolean },
    clinicName?: string,
    isIndependent?: boolean,
  ): void {
    if (typeof slugOrDetails === 'object' && slugOrDetails !== null) {
      this.trackEvent('view_item', {
        item_id: slugOrDetails.dentist_id ?? slugOrDetails.dentistId ?? slugOrDetails.slug ?? '',
        item_name: slugOrDetails.dentist_name ?? slugOrDetails.clinicName ?? '',
        item_category: (slugOrDetails.is_independent ?? slugOrDetails.isIndependent) ? 'independent_dentist' : 'clinic',
        locality: slugOrDetails.locality,
        city: slugOrDetails.city,
      });
      return;
    }
    this.trackEvent('view_item', {
      item_id: slugOrDetails,
      item_name: clinicName,
      item_category: isIndependent ? 'independent_dentist' : 'clinic',
    });
  }

  /** Track joining a video consultation session. */
  trackVideoRoomJoined(details: { role?: 'patient' | 'host'; isStaff?: boolean; is_staff?: boolean; appointmentId?: string; appointment_id?: string }): void {
    const isStaff = details.is_staff ?? details.isStaff;
    const role = details.role ?? (isStaff ? 'host' : 'patient');
    this.trackEvent('join_video_consultation', {
      user_role: role,
      appointment_id: details.appointment_id ?? details.appointmentId,
    });
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  /** Dynamically inject the GA4 gtag.js script tag with Consent Mode v2 defaults. */
  private ensureScriptLoaded(initialId: string): void {
    if (this.initialised || this.scriptLoading) return;
    this.scriptLoading = true;

    // Initialise dataLayer and gtag shim
    window.dataLayer ??= [];
    window.gtag = (...args: unknown[]) => {
      window.dataLayer?.push(args);
    };

    // Google Consent Mode v2 standard defaults
    this.gtag('consent', 'default', {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });

    this.gtag('js', new Date());

    // Configure platform tracking ID if available
    if (this.platformTrackingId) {
      this.gtag('config', this.platformTrackingId, { send_page_view: false });
    }
    // Configure clinic tracking ID if available
    if (this.clinicTrackingId && this.clinicTrackingId !== this.platformTrackingId) {
      this.gtag('config', this.clinicTrackingId, { send_page_view: false });
    }

    const loadId = this.platformTrackingId || initialId;
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(loadId)}`;
    script.onload = () => {
      this.initialised = true;
      this.scriptLoading = false;
      this.trackPageView(window.location.pathname + window.location.search);
    };
    script.onerror = () => {
      this.scriptLoading = false;
      console.warn('[AnalyticsService] gtag.js failed to load (ad-blocker or network error)');
    };
    document.head.appendChild(script);
  }

  /** Listen to Angular route changes and fire page_view events. */
  private listenToRouteChanges(): void {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(event => {
        this.trackPageView(event.urlAfterRedirects);
      });
  }

  /** Type-safe wrapper around window.gtag. */
  private gtag(...args: unknown[]): void {
    window.gtag?.(...args);
  }
}
