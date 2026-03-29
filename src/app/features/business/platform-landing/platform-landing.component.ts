import { Component, ChangeDetectionStrategy, signal } from '@angular/core';
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
      emoji: '📱',
      title: 'Mobile-first design',
      desc: 'Looks perfect on every screen — phones, tablets and desktops.',
    },
    {
      emoji: '📅',
      title: 'Online appointment booking',
      desc: 'Patients book directly from the website. Instant WhatsApp confirmation.',
    },
    {
      emoji: '🔒',
      title: 'Secure admin dashboard',
      desc: 'Clinic owner logs in to view and manage all patient bookings.',
    },
    {
      emoji: '🌐',
      title: 'Custom domain',
      desc: 'Your clinic on your own domain — e.g. snehadental.com.',
    },
    {
      emoji: '⚡',
      title: 'Live in 24 hours',
      desc: 'From zero to a live website in one business day. No waiting.',
    },
    {
      emoji: '💬',
      title: 'WhatsApp support',
      desc: 'We handle all updates and technical issues via WhatsApp.',
    },
  ];

  readonly faqs = [
    {
      q: 'Do I need to own a domain name?',
      a: 'No. We can give you a free subdomain like yourclinic.vercel.app to start. If you want your own domain (e.g. snehadental.com), we help you buy and set it up.',
    },
    {
      q: 'How do patients book appointments?',
      a: 'Patients fill a simple booking form on your website. The booking is saved and you get notified. You can also share a direct WhatsApp booking link.',
    },
    {
      q: 'Can I update my services and clinic info later?',
      a: 'Yes. You get an admin dashboard where you can view appointments. For content updates (services, hours, photos), just WhatsApp us — included in your monthly plan.',
    },
    {
      q: 'What if I already have a website?',
      a: 'We can migrate your content and replace your old site, or run both side-by-side during transition. No disruption to existing patients.',
    },
    {
      q: 'Is there a contract or lock-in?',
      a: 'No lock-in. Monthly subscription — cancel anytime. Your domain and content always belong to you.',
    },
    {
      q: 'Do you support multiple clinic branches?',
      a: 'Yes — the Enterprise plan supports multiple locations under one account, each with their own website and booking system.',
    },
  ];

  readonly openFaq = signal<number | null>(null);

  toggleFaq(i: number) {
    this.openFaq.set(this.openFaq() === i ? null : i);
  }

  // ── Replace with your own details ────────────────────────────────────────
  readonly devWhatsapp = '919999999999';
  readonly devEmail    = 'hello@yourplatform.com';
  readonly demoUrl     = 'https://sneha-dental.vercel.app';
  // ─────────────────────────────────────────────────────────────────────────

  whatsappEnquiry(planName: string) {
    const msg = `Hi! I'm interested in the ${planName} plan for my dental clinic. Can we discuss?`;
    window.open(`https://wa.me/${this.devWhatsapp}?text=${encodeURIComponent(msg)}`, '_blank');
  }
}
