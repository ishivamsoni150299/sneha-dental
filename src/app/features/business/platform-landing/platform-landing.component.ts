import { Component, ChangeDetectionStrategy, HostListener, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  formatPlatformPlanPrice,
  hasPlatformFeature,
  PLATFORM_FEATURE_LABELS,
  PLATFORM_PLANS,
  type PlatformPlanId,
} from '../../../core/config/clinic.config';
import { PLATFORM_FAQS } from '../../../core/content/platform-marketing.content';
import { PlatformBrandComponent } from '../../../shared/components/platform-brand/platform-brand.component';
type PlanId = PlatformPlanId;

@Component({
  selector: 'app-platform-landing',
  standalone: true,
  imports: [RouterLink, PlatformBrandComponent],
  templateUrl: './platform-landing.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformLandingComponent {
  readonly starterMonthlyPrice = formatPlatformPlanPrice('starter', 'monthly');
  readonly proMonthlyPrice = formatPlatformPlanPrice('pro', 'monthly');


  readonly billingYearly = signal(false);
  readonly mobileMenuOpen = signal(false);
  readonly showMobileCta = signal(false);
  readonly roiPlan = signal<'Basic' | 'Pro'>('Basic');
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

  readonly plans = (['trial', 'starter', 'pro'] as const).map(id => ({
    id,
    name: PLATFORM_PLANS[id].label,
    tag: id === 'trial' ? 'Free forever' : id === 'starter' ? 'For growing clinics' : 'AI-powered',
    monthly: PLATFORM_PLANS[id].monthly,
    yearly: PLATFORM_PLANS[id].yearly,
    highlighted: id === 'pro',
    features: PLATFORM_PLANS[id].features.map(feature => PLATFORM_FEATURE_LABELS[feature]),
    notIncluded: PLATFORM_PLANS.pro.features
      .filter(feature => !hasPlatformFeature(id, feature))
      .map(feature => PLATFORM_FEATURE_LABELS[feature]),
  }));

  readonly growthPaths = [
    {
      eyebrow: 'Start lean',
      title: 'Free launch for first-time clinics',
      summary: 'Go live before you spend. Accept bookings and share your platform link without a time limit.',
      outcome: 'Free forever with booking capture from day one.',
      planId: 'trial' as const,
      cta: 'Start free',
      offer: 'Free clinic launch',
    },
    {
      eyebrow: 'Most chosen',
      title: 'Basic for clinics ready to grow',
      summary: 'Add patient records, doctor schedules, your own brand, and a custom domain.',
      outcome: 'Best for clinics that need daily operational tools and a fully owned identity.',
      planId: 'starter' as const,
      cta: 'Choose Basic',
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
      title: 'Patients cannot match you to their need',
      desc: 'A patient searches for tooth pain, braces, implants, or urgent care. A complete treatment profile helps the right patient find you.',
    },
    {
      emoji: '📵',
      title: 'Availability is hidden behind a phone call',
      desc: 'Patients want to know when they can be seen before they commit. Publish available times and collect requests around the clock.',
    },
    {
      emoji: '📋',
      title: 'Appointment requests are scattered',
      desc: 'Calls, WhatsApp, and walk-ins are easy to miss. Keep patient requests, confirmations, and schedules in one clinic workspace.',
    },
  ];

  readonly features = [
    { emoji: '📱', title: 'Treatment-based discovery',    desc: 'Patients find your clinic by dental problem, treatment, and location.' },
    { emoji: '📅', title: 'Online appointment booking',   desc: 'Publish availability and receive patient requests with instant dashboard and email alerts.' },
    { emoji: '🌐', title: 'Verified clinic profile',       desc: 'Show qualifications, clinic contact, address, treatments, fees, and trust signals clearly.' },
    { emoji: '🎙️', title: 'AI Voice Receptionist',       desc: 'Answers patient calls in Hindi & English 24/7. Books appointments automatically — even at midnight.' },
    { emoji: '🔒', title: 'Secure admin dashboard',      desc: 'Clinic owner logs in to view and manage all patient bookings.' },
    { emoji: '💬', title: 'WhatsApp support',            desc: 'We handle all updates and technical issues via WhatsApp.' },
  ];

  readonly guarantees = [
    { emoji: '✓', text: 'Verified clinic and dentist information' },
    { emoji: '📍', text: 'Treatment and location-based discovery' },
    { emoji: '📅', text: 'Published appointment availability' },
    { emoji: '📱', text: 'Patient-friendly mobile booking' },
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
      description: 'Verification, treatments, fees, dentist profiles, availability, booking flow, and WhatsApp routing.',
      timeline: 'Same day',
    },
    {
      title: 'Start collecting patients',
      description: 'Your listing goes live with appointment capture and an admin dashboard ready to use.',
      timeline: 'Day 1',
    },
  ];

  readonly testimonials = [
    {
      text: `Patients can now see our clinic details and request a time without calling first. The booking alerts are instant. Best ${this.starterMonthlyPrice} we spend for patient growth.`,
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
      text: 'My receptionist used to spend hours answering the same questions. Now patients see our information and availability first. The AI voice agent even books when we\'re closed.',
      name: 'Dr. Anil Mehta',
      clinic: 'Mehta Dental Clinic',
      location: 'Mumbai',
      initials: 'AM',
    },
  ];

  readonly results = [
    { value: '5×',     label: 'More online inquiries',   desc: 'Average increase in monthly appointment requests after going live' },
    { value: '3 hrs',  label: 'Saved daily',             desc: 'Time saved on phone calls answering hours, pricing & location questions' },
    { value: '< 24h',  label: 'To go live',              desc: 'From signup to a verified clinic listing with online booking enabled' },
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

  setRoiPlan(planName: 'Basic' | 'Pro'): void {
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
