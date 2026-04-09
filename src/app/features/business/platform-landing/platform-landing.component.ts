import { Component, ChangeDetectionStrategy, signal, inject, OnInit, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ClinicFirestoreService, StoredClinic } from '../../../core/services/clinic-firestore.service';

@Component({
  selector: 'app-platform-landing',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './platform-landing.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformLandingComponent implements OnInit {
  private readonly firestoreService = inject(ClinicFirestoreService);
  readonly liveClinics = signal<StoredClinic[]>([]);
  readonly clinicsLoaded = signal(false);

  // First active clinic URL used as the live demo link
  readonly demoUrl = computed(() => {
    const first = this.liveClinics()[0];
    if (!first) return null;
    if (first.domain)       return `https://${first.domain}`;
    if (first.vercelDomain) return `https://${first.vercelDomain}`;
    return null;
  });

  ngOnInit() {
    this.firestoreService.getActive()
      .then(clinics => { this.liveClinics.set(clinics); this.clinicsLoaded.set(true); })
      .catch(() => this.clinicsLoaded.set(true));
  }

  readonly plans = [
    {
      name: 'Trial',
      tag: 'Try for free',
      monthly: 0,
      yearly: 0,
      trialDays: 30,
      highlighted: false,
      features: [
        '30-day free trial',
        'Fully responsive website',
        'Online appointment booking',
        'WhatsApp integration',
        'Patient admin dashboard',
        'Contact & location page',
        'Free subdomain (yourname.vercel.app)',
      ],
    },
    {
      name: 'Starter',
      tag: 'For solo clinics',
      monthly: 399,
      yearly: 3999,
      trialDays: null,
      highlighted: false,
      features: [
        'Everything in Trial',
        'Custom domain setup',
        'Free SSL certificate',
        'Services catalogue page',
        'Priority WhatsApp support',
        '1 content update / month',
      ],
    },
    {
      name: 'Pro',
      tag: 'Most popular',
      monthly: 699,
      yearly: 6999,
      trialDays: null,
      highlighted: true,
      features: [
        'Everything in Starter',
        'AI Voice Receptionist (Hindi + English)',
        'Website voice mic widget',
        'Google Reviews integration',
        'Testimonials management',
        'SEO optimised pages',
        'Google Analytics setup',
        'Unlimited content updates',
        'Priority support',
      ],
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
    { emoji: '📅', title: 'Online appointment booking',  desc: 'Patients book directly from the website. Instant WhatsApp confirmation.' },
    { emoji: '🎙️', title: 'AI Voice Receptionist',       desc: 'Answers patient calls in Hindi & English 24/7. Books appointments automatically — even at midnight.' },
    { emoji: '🔒', title: 'Secure admin dashboard',      desc: 'Clinic owner logs in to view and manage all patient bookings.' },
    { emoji: '🌐', title: 'Custom domain',               desc: 'Your clinic on your own domain — e.g. snehadental.com.' },
    { emoji: '⚡', title: 'Live in 24 hours',            desc: 'From zero to a live website in one business day. No waiting.' },
    { emoji: '💬', title: 'WhatsApp support',            desc: 'We handle all updates and technical issues via WhatsApp.' },
  ];

  readonly guarantees = [
    { emoji: '🔐', text: 'Free SSL certificate on every site' },
    { emoji: '🌍', text: 'Custom domain or free subdomain' },
    { emoji: '⚡', text: 'Lightning-fast hosting on Vercel' },
    { emoji: '📱', text: '100% mobile responsive design' },
    { emoji: '🔔', text: 'Instant WhatsApp booking notifications' },
    { emoji: '🛡️', text: 'Secure patient data with Firebase' },
    { emoji: '♾️', text: 'Unlimited patient bookings' },
    { emoji: '📊', text: 'Appointment tracking dashboard' },
  ];

  readonly faqs = [
    { q: 'Do I need to own a domain name?',
      a: 'No. We give you a free subdomain like yourclinic.vercel.app to start on the Trial plan. If you want your own domain (e.g. snehadental.com), we help you buy and set it up — included in the Starter plan at no extra charge.' },
    { q: 'How do patients book appointments?',
      a: 'Patients fill a simple booking form on your website. The booking is saved and you get notified. You can also share a direct WhatsApp booking link with patients.' },
    { q: 'Can I update my services and clinic info later?',
      a: 'Yes. You get an admin dashboard to view appointments. For content updates (services, hours, photos), just WhatsApp us — Starter includes 1 update/month, Pro includes unlimited updates.' },
    { q: 'What if I already have a website?',
      a: 'We can migrate your content and replace your old site, or run both side-by-side during transition. No disruption to existing patients.' },
    { q: 'Is there a contract or lock-in?',
      a: 'No lock-in. Monthly subscription — cancel anytime. Your domain and content always belong to you.' },
    { q: 'Do you support multiple clinic branches?',
      a: 'Yes — the Pro plan supports multi-doctor clinics. For multi-location chains with separate websites per branch, contact us for a custom quote.' },
  ];

  readonly openFaq = signal<number | null>(null);
  toggleFaq(i: number) { this.openFaq.set(this.openFaq() === i ? null : i); }

  // ── Replace with your real details ───────────────────────────────────────
  readonly devWhatsapp = '919999999999';
  readonly devEmail    = 'hello@yourplatform.com';
  // ─────────────────────────────────────────────────────────────────────────

  clinicUrl(clinic: StoredClinic): string {
    if (clinic.domain)       return `https://${clinic.domain}`;
    if (clinic.vercelDomain) return `https://${clinic.vercelDomain}`;
    return '#';
  }

  scrollTo(sectionId: string): void {
    const el = document.getElementById(sectionId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  whatsappEnquiry(planName: string) {
    const msg = `Hi! I'm interested in the ${planName} plan for my dental clinic. Can we discuss?`;
    window.open(`https://wa.me/${this.devWhatsapp}?text=${encodeURIComponent(msg)}`, '_blank');
  }
}
