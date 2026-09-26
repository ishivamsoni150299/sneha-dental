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
    a: 'Paid plans bill monthly. Razorpay subscribers can stop renewal from clinic settings; paid access continues through the current billing cycle. Your domain and content remain yours.',
  },
  {
    q: 'Do you support multiple doctors or clinic branches?',
    a: 'Basic and Pro support multiple verified doctor profiles and schedules. Each clinic workspace represents one location; multi-location groups can manage separate listings for each branch.',
  },
  {
    q: 'Is the AI Voice Receptionist included?',
    a: 'No. AI Voice is coming soon and is not available or included in any current paid plan.',
  },
];
