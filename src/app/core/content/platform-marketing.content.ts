import type { ClinicFaq } from '../config/clinic.config';

export const PLATFORM_FAQS: readonly ClinicFaq[] = [
  {
    q: 'Do I need to own a domain name?',
    a: 'No. The Free plan includes a subdomain like yourclinic.mydentalplatform.com with no expiry. Basic and Pro let you connect your own domain, such as snehadental.com, with SSL included.',
  },
  {
    q: 'How do patients book appointments?',
    a: 'Patients fill a simple booking form on your website. The booking is saved and you get notified. You can also share a direct WhatsApp booking link with patients.',
  },
  {
    q: 'Can I update my services and clinic info later?',
    a: 'Yes. Every plan includes clinic profile, contact, hours, services, testimonials, and social-link controls. Basic and Pro also unlock your clinic logo, theme, platform-brand removal, patient records, and doctor management.',
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
    q: 'Do you support multiple doctors or clinic branches?',
    a: 'Basic and Pro support multiple doctor profiles and schedules. Each clinic workspace represents one location; multi-location chains with separate websites per branch can contact us for a custom quote.',
  },
  {
    q: 'What is the early adopter pricing guarantee?',
    a: 'First 20 clinics get their signup price locked for 12 months from activation date. This applies only to the plan you select at signup — upgrading moves you to current pricing. Downgrading forfeits the benefit. After 12 months, you get 30-day advance notice before any price change. Yearly subscribers get their price locked for the full subscription year regardless.',
  },
  {
    q: 'How does the AI Voice Receptionist billing work?',
    a: 'Pro plan includes 30 voice minutes/month at no extra cost. After that, it\'s ₹20/min usage-based — you only pay for what you use. You can set a monthly overage budget cap (default ₹1,000) so there are never any surprises. When your limit is reached, the AI politely connects patients to your clinic number directly.',
  },
];