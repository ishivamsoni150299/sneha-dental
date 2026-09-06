import type { ClinicFaq } from '../config/clinic.config';

export const PLATFORM_FAQS: readonly ClinicFaq[] = [
  {
    q: 'Do I need a website to join?',
    a: 'No. You can create a verified clinic listing and accept appointment requests through mydentalplatform. A hosted clinic page and custom domain are optional tools for clinics that need them.',
  },
  {
    q: 'How do patients book appointments?',
    a: 'Patients search by dental problem and location, compare verified clinics, check published availability, and request a suitable time. The request appears in your clinic dashboard for confirmation.',
  },
  {
    q: 'Can I update dentists, treatments, fees, and availability?',
    a: 'Yes. Your clinic workspace lets you keep profile details, doctors, treatments, consultation fees, hours, and appointment availability current.',
  },
  {
    q: 'What if I already have a website?',
    a: 'Keep it. Your mydentalplatform listing and booking link can work alongside your existing website and WhatsApp without disrupting current patients.',
  },
  {
    q: 'Is there a contract or lock-in?',
    a: 'No lock-in. Monthly subscription — cancel anytime. Your domain and content always belong to you.',
  },
  {
    q: 'Do you support multiple doctors or clinic branches?',
    a: 'Basic and Pro support multiple verified doctor profiles and schedules. Each clinic workspace represents one location; multi-location groups can manage separate listings for each branch.',
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
