import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  selector: 'app-platform-legal',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="platform-auth-shell">
      <header class="platform-auth-topbar">
        <div class="ui-container flex h-16 items-center justify-between gap-4">
          <a routerLink="/business" class="flex items-center gap-2.5" aria-label="mydentalplatform home">
            <img src="/assets/brand/mydentalplatform-logo.svg" class="h-9 w-9" alt="">
            <span class="text-sm font-bold">mydental<span class="text-ui-primary">platform</span></span>
          </a>
          <a routerLink="/business/signup" class="ui-btn ui-btn-secondary ui-btn-sm">Start free</a>
        </div>
      </header>

      <main id="main-content" class="ui-container-reading py-12 sm:py-16">
        <p class="ui-eyebrow">Legal</p>
        <h1 class="ui-heading mt-3">{{ isPrivacy ? 'Platform privacy policy' : 'Platform terms of service' }}</h1>
        <p class="ui-caption mt-3">Effective 1 September 2026</p>

        @if (isPrivacy) {
          <div class="mt-10 space-y-8 text-sm leading-7 text-ui-ink-soft">
            <section>
              <h2 class="ui-title">Information we process</h2>
              <p class="mt-2">We process account identity, clinic details, subscription information, product usage, support communications, and configuration needed to operate each clinic workspace. For patients, we process the verified mobile number and appointment coordination details submitted through clinic websites or the marketplace.</p>
            </section>
            <section>
              <h2 class="ui-title">How information is used</h2>
              <p class="mt-2">Information is used to authenticate users, provide clinic websites and operational tools, manage appointments and subscriptions, prevent abuse, deliver notifications, and improve reliability. We do not sell personal information.</p>
            </section>
            <section>
              <h2 class="ui-title">Tenant isolation and providers</h2>
              <p class="mt-2">Clinic workspaces are separated by authenticated tenant permissions. Essential providers may process limited information for hosting, authentication, databases, payments, email delivery, monitoring, and enabled AI services.</p>
            </section>
            <section>
              <h2 class="ui-title">Patient phone verification</h2>
              <p class="mt-2">The patient appointment portal uses Firebase phone authentication and reCAPTCHA. A verified number may be used to link appointments booked with that same number. The portal exposes scheduling details only; clinical notes, treatment records, and clinic billing fields are not part of the shared patient profile.</p>
            </section>
            <section>
              <h2 class="ui-title">Appointment reviews</h2>
              <p class="mt-2">A patient may submit one review after a linked appointment is marked completed. Public reviews show the rating, review text, a limited patient alias or “Verified patient,” publication date, and any clinic response. Appointment identifiers, verified phone numbers, account identifiers, and moderation reports are kept in restricted records and are not published. Platform staff may moderate reviews and investigate reports; clinics may respond to published reviews but cannot edit patient feedback.</p>
            </section>
            <section>
              <h2 class="ui-title">Retention and requests</h2>
              <p class="mt-2">Clinics control retention of their appointment and care records, subject to applicable obligations. The platform retains a minimal portal identity while needed for appointment coordination, security, and recovery. Clinic account owners and patients may request access, correction, export, or deletion by contacting support.</p>
            </section>
          </div>
        } @else {
          <div class="mt-10 space-y-8 text-sm leading-7 text-ui-ink-soft">
            <section>
              <h2 class="ui-title">Service</h2>
              <p class="mt-2">mydentalplatform provides clinic discovery, appointment coordination, hosted clinic websites, clinic administration, communications integrations, and subscription features. Marketplace appointment times are requests until the clinic confirms them. Availability of paid or third-party features depends on the selected plan and provider configuration.</p>
            </section>
            <section>
              <h2 class="ui-title">Patient portal</h2>
              <p class="mt-2">Patients must verify the mobile number used for a booking before linking or managing it. Patients are responsible for keeping access to that number secure and for providing accurate appointment information. Online changes may close near the appointment time, in which case the clinic must be contacted directly.</p>
            </section>
            <section>
              <h2 class="ui-title">Reviews and moderation</h2>
              <p class="mt-2">Only patients with a completed linked appointment may submit a review, with one review allowed per appointment. Reviews must reflect a genuine experience and must not contain unlawful, abusive, misleading, confidential, or unnecessary personal information. Reviews may be rejected, removed, or investigated after a report. Clinics may post a professional response but may not alter the patient’s rating or text.</p>
            </section>
            <section>
              <h2 class="ui-title">Account responsibilities</h2>
              <p class="mt-2">Account owners must provide accurate clinic information, protect access credentials, give access only to authorised staff, and use patient information lawfully. Clinical advice and treatment remain the responsibility of the clinic.</p>
            </section>
            <section>
              <h2 class="ui-title">Subscriptions and acceptable use</h2>
              <p class="mt-2">Paid plans renew according to the checkout terms. Access may be limited after expiry, cancellation, failed payment, misuse, unlawful activity, security risk, or material breach. Users must not probe, disrupt, scrape, or misuse the service.</p>
            </section>
            <section>
              <h2 class="ui-title">Service changes</h2>
              <p class="mt-2">The portal coordinates appointments and is not a shared medical record, emergency service, or source of medical advice. Features may change as the platform improves or third-party services evolve. We work to preserve clinic data and communicate material changes, but uninterrupted availability cannot be guaranteed.</p>
            </section>
          </div>
        }

        <div class="mt-12 flex flex-wrap gap-3 border-t border-ui-line pt-6">
          <a routerLink="/business/privacy" class="ui-btn ui-btn-secondary" [attr.aria-current]="isPrivacy ? 'page' : null">Privacy</a>
          <a routerLink="/business/terms" class="ui-btn ui-btn-secondary" [attr.aria-current]="!isPrivacy ? 'page' : null">Terms</a>
          <a href="mailto:mydentalplatform@zohomail.in" class="ui-btn ui-btn-ghost">Contact support</a>
        </div>
      </main>
    </div>
  `,
})
export class PlatformLegalComponent {
  private readonly route = inject(ActivatedRoute);
  readonly isPrivacy = this.route.snapshot.data['legalPage'] === 'privacy';
}