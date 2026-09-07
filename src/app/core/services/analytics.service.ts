import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

/**
 * Google Analytics GA4 (gtag.js) service.
 *
 * - Dynamically injects the gtag script at runtime (no hardcoded script in index.html).
 * - Auto-tracks page views on every route change.
 * - Exposes `trackEvent()` for custom click / conversion tracking.
 *
 * Usage — inject in AppComponent constructor:
 *   inject(AnalyticsService);
 *
 * Custom events from any component:
 *   this.analytics.trackEvent('book_appointment_click', 'engagement', 'Book Appointment CTA');
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly router = inject(Router);
  private readonly trackingId = environment.gaTrackingId;
  private initialised = false;

  constructor() {
    if (!this.isBrowser || !this.trackingId) {
      return; // SSR or no tracking ID configured — skip entirely.
    }

    this.loadGtagScript();
    this.listenToRouteChanges();
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Send a custom GA4 event.
   *
   * @param eventName   GA4 event name, e.g. 'book_appointment_click'
   * @param category    Logical grouping, e.g. 'engagement', 'conversion'
   * @param label       Human-readable label shown in GA reports
   * @param value       Optional numeric value (e.g. amount, count)
   *
   * @example
   *   analytics.trackEvent('book_appointment_click', 'conversion', 'Hero CTA');
   *   analytics.trackEvent('whatsapp_click', 'engagement', 'Floating Button');
   *   analytics.trackEvent('call_now_click', 'engagement', 'Hero Section');
   *   analytics.trackEvent('form_submit', 'conversion', 'Contact Form');
   */
  trackEvent(eventName: string, category: string, label?: string, value?: number): void {
    if (!this.initialised) return;
    this.gtag('event', eventName, {
      event_category: category,
      event_label: label,
      value,
    });
  }

  /** Manually track a page view (auto-tracked on route change already). */
  trackPageView(path: string, title?: string): void {
    if (!this.initialised) return;
    this.gtag('event', 'page_view', {
      page_path: path,
      page_title: title ?? document.title,
    });
  }

  // ── Internals ────────────────────────────────────────────────────────────

  /** Dynamically inject the GA4 gtag.js script tag. */
  private loadGtagScript(): void {
    // Initialise the gtag data layer.
    (window as any).dataLayer = (window as any).dataLayer || [];
    (window as any).gtag = (...args: any[]) => {
      (window as any).dataLayer.push(args);
    };
    this.gtag('js', new Date());
    this.gtag('config', this.trackingId, { send_page_view: false }); // we send page_view manually on route change

    // Inject the script element.
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${this.trackingId}`;
    script.onload = () => {
      this.initialised = true;
      // Send the initial page view for the landing page.
      this.trackPageView(window.location.pathname + window.location.search);
    };
    script.onerror = () => {
      // Adblocker likely blocked the script — fail silently.
      console.warn('[AnalyticsService] gtag.js failed to load (ad-blocker?)');
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
  private gtag(...args: any[]): void {
    if (typeof (window as any).gtag === 'function') {
      (window as any).gtag(...args);
    }
  }
}
