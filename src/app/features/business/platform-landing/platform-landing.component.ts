import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-platform-landing',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './platform-landing.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformLandingComponent {
  readonly plans = [
    {
      name: 'Starter',
      tag: 'For solo clinics',
      setupFee: '₹4,999',
      monthly: '₹999',
      highlighted: false,
      features: [
        'Fully responsive website',
        'Online appointment booking',
        'WhatsApp integration',
        'Patient admin dashboard',
        'Contact & location page',
        'Custom domain setup',
        'Free SSL certificate',
        '1 revision / month',
      ],
    },
    {
      name: 'Professional',
      tag: 'Most popular',
      setupFee: '₹9,999',
      monthly: '₹1,999',
      highlighted: true,
      features: [
        'Everything in Starter',
        'Health plans & pricing page',
        'Testimonials management',
        'Services catalogue',
        'SEO optimised pages',
        'Google Analytics setup',
        'Priority WhatsApp support',
        '3 revisions / month',
      ],
    },
    {
      name: 'Enterprise',
      tag: 'Multi-location chains',
      setupFee: 'Custom',
      monthly: 'Custom',
      highlighted: false,
      features: [
        'Everything in Professional',
        'Multiple clinic locations',
        'Dedicated Firebase project',
        'Custom integrations',
        'SLA-backed uptime',
        'Dedicated account manager',
        'Unlimited revisions',
        'Priority deployment',
      ],
    },
  ];

  readonly features = [
    {
      icon: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z',
      title: 'Mobile-first design',
      desc: 'Looks perfect on every screen — phones, tablets and desktops.',
    },
    {
      icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
      title: 'Online appointment booking',
      desc: 'Patients book directly via WhatsApp. Instant confirmation.',
    },
    {
      icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
      title: 'Admin dashboard',
      desc: 'Manage appointments, update services and clinic info yourself.',
    },
    {
      icon: 'M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064',
      title: 'Custom domain',
      desc: 'Your clinic on your own domain — e.g. snehadental.com.',
    },
    {
      icon: 'M13 10V3L4 14h7v7l9-11h-7z',
      title: 'Live in 24 hours',
      desc: 'From zero to a live website in one business day. No waiting.',
    },
    {
      icon: 'M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z',
      title: 'Ongoing support',
      desc: 'WhatsApp support line for content updates and technical help.',
    },
  ];

  // ── Replace these with your own details ──────────────────────────────────
  readonly devWhatsapp = '919999999999';   // your WhatsApp number (E164)
  readonly devEmail    = 'hello@yourplatform.com';
  // ─────────────────────────────────────────────────────────────────────────

  whatsappEnquiry(planName: string) {
    const msg = `Hi! I'm interested in the ${planName} plan for my dental clinic. Can we discuss?`;
    window.open(`https://wa.me/${this.devWhatsapp}?text=${encodeURIComponent(msg)}`, '_blank');
  }
}
