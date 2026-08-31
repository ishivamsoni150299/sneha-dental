import { Component, ChangeDetectionStrategy, HostListener, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatPlatformPlanPrice } from '../../../core/config/clinic.config';
import { PLATFORM_FAQS } from '../../../core/content/platform-marketing.content';
type PlanId = 'trial' | 'starter' | 'pro';

@Component({
  selector: 'app-platform-landing',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './platform-landing.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformLandingComponent {
  readonly starterMonthlyPrice = formatPlatformPlanPrice('starter', 'monthly');
  readonly proMonthlyPrice = formatPlatformPlanPrice('pro', 'monthly');


  readonly billingYearly = signal(false);
  readonly mobileMenuOpen = signal(false);
  readonly showMobileCta = signal(false);
  readonly roiPlan = signal<'Starter' | 'Pro'>('Starter');
  readonly monthlyMissedLeads = signal(12);
  readonly avgCaseValue = signal(3500);
  readonly leadCloseRate = signal(40);

  // ── Curated showcase clinics (fictional — protects real client privacy) ────
  readonly showcaseClinics = [
    {
      name: 'Sunrise Dental Care',
      city: 'Bengaluru',
      doctor: 'Dr. Kavitha Reddy',
      qual: 'BDS, MDS',
      services: ['Dental Implants', 'Aligners', 'Root Canal', 'Smile Makeover'],
      gradient: 'linear-gradient(135deg, #1E56DC, #3B7BF8)',
      badge: 'blue',
      domain: '',
    },
    {
      name: 'Pearl Smile Clinic',
      city: 'Pune',
      doctor: 'Dr. Rohan Mehta',
      qual: 'BDS, FAGE',
      services: ['Braces', 'Whitening', 'Scaling', 'Extraction'],
      gradient: 'linear-gradient(135deg, #0B7285, #0EA5C4)',
      badge: 'teal',
      domain: '',
    },
    {
      name: 'DentCare Plus',
      city: 'Hyderabad',
      doctor: 'Dr. Swati Rao',
      qual: 'MDS (Orthodontics)',
      services: ['Invisalign', 'Implants', 'Veneers', 'Kids Dentistry'],
      gradient: 'linear-gradient(135deg, #4338CA, #6366F1)',
      badge: 'purple',
      domain: '',
    },
  ];

  readonly plans = [
    {
      id: 'trial' as const,
      name: 'Trial',
      tag: 'Try for free',
      monthly: 0,
      yearly: 0,
      trialDays: 30,
      highlighted: false,
      features: [
        '30-day free trial · no card needed',
        'Fully responsive clinic website',
        'Online appointment booking',
        'Instant clinic booking alerts',
        'Patient admin dashboard',
        'Free subdomain (yourname.mydentalplatform.com)',
      ],
      notIncluded: [
        'Custom domain',
        'AI Voice Receptionist',
        'Content updates',
      ],
    },
    {
      id: 'starter' as const,
      name: 'Starter',
      tag: 'For solo clinics',
      monthly: 999,
      yearly: 9999,
      trialDays: null,
      highlighted: false,
      features: [
        'Everything in Trial',
        'Custom domain (connect your own)',
        'Auto SSL certificate',
        'Services catalogue management',
        '1 content update/month (text, image, or section)',
        'Email + WhatsApp support',
      ],
      notIncluded: [
        'AI Voice Receptionist',
        'Voice minutes',
      ],
    },
    {
      id: 'pro' as const,
      name: 'Pro',
      tag: 'Most popular',
      monthly: 2499,
      yearly: 24999,
      trialDays: null,
      highlighted: true,
      features: [
        'Everything in Starter',
        'AI Voice Receptionist 24/7',
        'Hindi + English + Hinglish support',
        '30 voice min/month included',
        '₹20/min after 30 min (usage-based)',
        '3 content updates/month (text, image, or section)',
        '1 onboarding call included (20 min)',
        'Priority WhatsApp support',
        'Revenue & analytics dashboard',
      ],
      notIncluded: [],
    },
  ];

  readonly growthPaths = [
    {
      eyebrow: 'Start lean',
      title: 'Trial launch for first-time clinics',
      summary: 'Go live before you spend. Test bookings, share your link, and validate demand with zero setup risk.',
      outcome: 'Free for 30 days with booking capture from day one.',
      planId: 'trial' as const,
      cta: 'Start free',
      offer: '30-day launch trial',
    },
    {
      eyebrow: 'Most chosen',
      title: 'Starter for solo clinics ready to grow',
      summary: 'Use your own domain, look established, and turn search traffic into consultations without agency fees.',
      outcome: 'Best for owner-led clinics targeting steady monthly bookings.',
      planId: 'starter' as const,
      cta: 'Choose Starter',
      offer: 'Domain-ready growth plan',
    },
    {
      eyebrow: 'High intent',
      title: 'Pro for clinics that miss calls and leads',
      summary: 'Add AI voice reception so patients can book after hours, during procedures, and when the front desk is busy.',
      outcome: 'Best for premium cases, multiple doctors, and higher inbound volume.',
      planId: 'pro' as const,
      cta: 'Choose Pro',
      offer: 'After-hours booking capture',
    },
  ];

  readonly painPoints = [
    {
      emoji: '😞',
      title: 'Patients can\'t find you online',
      desc: 'When someone searches "dental clinic near me", your competitors show up — not you. Those patients book elsewhere.',
    },
    {
      emoji: '📵',
      title: 'Your phone rings after hours',
      desc: 'Patients call to ask basic questions — hours, services, pricing. A website answers all of this automatically, 24/7.',
    },
    {
      emoji: '📋',
      title: 'No way to manage bookings',
      desc: 'Appointments come in via calls, WhatsApp, walk-ins — all scattered. One missed message = one lost patient.',
    },
  ];

  readonly features = [
    { emoji: '📱', title: 'Mobile-first design',         desc: 'Looks perfect on every screen — phones, tablets and desktops.' },
    { emoji: '📅', title: 'Online appointment booking',  desc: 'Patients book directly from the website. Instant dashboard and email alerts.' },
    { emoji: '🎙️', title: 'AI Voice Receptionist',       desc: 'Answers patient calls in Hindi & English 24/7. Books appointments automatically — even at midnight.' },
    { emoji: '🔒', title: 'Secure admin dashboard',      desc: 'Clinic owner logs in to view and manage all patient bookings.' },
    { emoji: '🌐', title: 'Custom domain',               desc: 'Your clinic on your own domain — e.g. snehadental.com.' },
    { emoji: '⚡', title: 'Live in 24 hours',            desc: 'From zero to a live website in one business day. No waiting.' },
    { emoji: '💬', title: 'WhatsApp support',            desc: 'We handle all updates and technical issues via WhatsApp.' },
  ];

  readonly guarantees = [
    { emoji: '🔐', text: 'Free SSL certificate on every site' },
    { emoji: '🌍', text: 'Custom domain or free subdomain' },
    { emoji: '⚡', text: 'Lightning-fast, always-online hosting' },
    { emoji: '📱', text: '100% mobile responsive design' },
    { emoji: '🔔', text: 'Instant dashboard and email booking alerts' },
    { emoji: '🛡️', text: 'Secure, encrypted patient data' },
    { emoji: '♾️', text: 'Unlimited patient bookings' },
    { emoji: '📊', text: 'Appointment tracking dashboard' },
  ];

  readonly faqs = PLATFORM_FAQS;

  planPrice(plan: { monthly: number; yearly: number }): number {
    return plan.monthly;
  }

  readonly roiPlanDetails = computed(() =>
    this.plans.find(plan => plan.name === this.roiPlan()) ?? this.plans[1],
  );

  readonly recoveredBookings = computed(() =>
    Math.max(1, Math.round(this.monthlyMissedLeads() * (this.leadCloseRate() / 100))),
  );

  readonly recoveredRevenue = computed(() =>
    this.recoveredBookings() * this.avgCaseValue(),
  );

  readonly roiMonthlyCost = computed(() => this.roiPlanDetails().monthly);

  readonly roiNetGain = computed(() =>
    Math.max(0, this.recoveredRevenue() - this.roiMonthlyCost()),
  );

  readonly roiPaybackBookings = computed(() =>
    Math.max(1, Math.ceil(this.roiMonthlyCost() / Math.max(1, this.avgCaseValue()))),
  );

  readonly launchChecklist = [
    {
      title: 'Send your clinic basics',
      description: 'Doctor details, services, phone number, address, logo and a few treatment photos.',
      timeline: '10 minutes',
    },
    {
      title: 'We configure everything',
      description: 'Website copy, booking flow, WhatsApp routing, domain connection and launch polish.',
      timeline: 'Same day',
    },
    {
      title: 'Start collecting patients',
      description: 'Your site goes live with appointment capture and an admin dashboard ready to use.',
      timeline: 'Day 1',
    },
  ];

  readonly testimonials = [
    {
      text: `We were getting patients calling just to ask if we were open. Now they check our website and book directly. The booking alerts are instant. Best ${this.starterMonthlyPrice} we spend for patient growth.`,
      name: 'Dr. Ramesh Kumar',
      clinic: 'Indram Dental, Jhansi',
      location: 'Uttar Pradesh',
      initials: 'RK',
    },
    {
      text: 'Launched on a Friday. By Monday we had 5 new appointment requests from patients who found us online. Setup took less than a day — no technical work needed from my side.',
      name: 'Dr. Priya Sharma',
      clinic: 'Smile Care Dental',
      location: 'Delhi',
      initials: 'PS',
    },
    {
      text: 'My receptionist used to spend hours answering the same questions. Now patients get everything from the website. The AI voice agent even books when we\'re closed.',
      name: 'Dr. Anil Mehta',
      clinic: 'Mehta Dental Clinic',
      location: 'Mumbai',
      initials: 'AM',
    },
  ];

  readonly results = [
    { value: '5×',     label: 'More online inquiries',   desc: 'Average increase in monthly appointment requests after going live' },
    { value: '3 hrs',  label: 'Saved daily',             desc: 'Time saved on phone calls answering hours, pricing & location questions' },
    { value: '< 24h',  label: 'To go live',              desc: 'From signing up to a fully working website with online bookings enabled' },
    { value: '₹0',     label: 'Setup cost',              desc: 'No agency fees, no developer, no hidden charges. Ever.' },
  ];

  readonly openFaq = signal<number | null>(null);
  toggleFaq(i: number): void { this.openFaq.set(this.openFaq() === i ? null : i); }

  @HostListener('window:scroll')
  onWindowScroll(): void {
    this.showMobileCta.set(window.scrollY > 560);
  }

  // ── Replace with your real details ───────────────────────────────────────
  readonly devWhatsapp = '919140210648';
  readonly devEmail    = 'mydentalplatform@zohomail.in';
  // ─────────────────────────────────────────────────────────────────────────

  initials(name: string): string {
    return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  }

  scrollTo(sectionId: string): void {
    const el = document.getElementById(sectionId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  setRoiPlan(planName: 'Starter' | 'Pro'): void {
    this.roiPlan.set(planName);
  }

  signupQuery(plan: PlanId, source: string, campaign = 'sales-sprint', offer?: string): Record<string, string> {
    const query: Record<string, string> = { plan, source, campaign };
    if (plan !== 'trial') {
      query['cycle'] = 'monthly';
    }
    if (offer) query['offer'] = offer;
    return query;
  }

  whatsappEnquiry(planName: string): void {
    const msg = `Hi! I'm interested in the ${planName} plan for my dental clinic. Can we discuss?`;
    window.open(`https://wa.me/${this.devWhatsapp}?text=${encodeURIComponent(msg)}`, '_blank');
  }
}
