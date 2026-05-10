import type { ClinicFaq, ClinicImage } from '../config/clinic.config';

export type ServiceCategory = 'All' | 'Preventive' | 'Restorative' | 'Cosmetic' | 'Surgical';

export const SERVICE_CATEGORIES: readonly ServiceCategory[] = [
  'All',
  'Preventive',
  'Restorative',
  'Cosmetic',
  'Surgical',
];

export const SERVICE_CATEGORY_MAP: Readonly<Record<string, Exclude<ServiceCategory, 'All'>>> = {
  'General Dentistry': 'Preventive',
  'Cleaning & Scaling': 'Preventive',
  'Tooth Fillings': 'Restorative',
  'Root Canal': 'Restorative',
  'Cosmetic Dentistry': 'Cosmetic',
  'Teeth Whitening': 'Cosmetic',
  Orthodontics: 'Cosmetic',
  'Dental Implants': 'Surgical',
  Extraction: 'Surgical',
};

export const DEFAULT_TRUST_PILLS: readonly string[] = [
  'Same-day slots',
  'No hidden charges',
  'Gentle treatment',
];

export const DEFAULT_CLINIC_MOMENTS: readonly ClinicImage[] = [
  {
    src: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=900&q=80',
    alt: 'Modern treatment room',
    label: 'Treatment Room',
  },
  {
    src: 'https://placehold.co/480x360/EAF4FF/1E56DC?text=Reception',
    alt: 'Clinic reception area',
    label: 'Reception',
  },
  {
    src: 'https://placehold.co/480x360/F1F8FF/1E56DC?text=Sterilisation',
    alt: 'Sterilisation and hygiene area',
    label: 'Hygiene',
  },
];

export const HOME_FAQS: readonly ClinicFaq[] = [
  {
    q: 'Will the treatment be painful?',
    a: 'We use modern anaesthesia and gentle techniques so the vast majority of treatments are completely painless. For anxious patients we take extra time to make you comfortable before we begin.',
  },
  {
    q: 'How much does a typical treatment cost?',
    a: 'Costs vary by treatment. A cleaning starts around Rs. 500, fillings from Rs. 800, and root canals from Rs. 3,000. We always tell you the exact price before starting. No hidden charges, ever.',
  },
  {
    q: 'Do you see children?',
    a: 'Yes. We welcome patients of all ages. We have a child-friendly approach and can treat kids from age 3 onwards for check-ups, cleanings, and early orthodontic guidance.',
  },
  {
    q: 'How do I manage or cancel my booking?',
    a: 'Visit the Manage Booking page with your booking reference and phone number. You can view your details and contact us to reschedule any time before your appointment.',
  },
  {
    q: 'Are same-day appointments available?',
    a: 'Yes. We keep emergency and same-day slots open most days. Book online and mention urgent in the notes, or call us directly for the fastest response.',
  },
  {
    q: 'How do I know my booking went through?',
    a: 'You will receive a booking reference number on screen immediately. The clinic will call or WhatsApp you within 2 hours to confirm the exact time slot.',
  },
];

export const SERVICES_FAQS: readonly ClinicFaq[] = [
  {
    q: 'How long does a routine check-up take?',
    a: 'A standard check-up and cleaning takes 30-45 minutes. If we find something that needs attention we will explain it clearly before doing anything.',
  },
  {
    q: 'Is the treatment painful?',
    a: 'We use modern anaesthesia and gentle techniques so most procedures are completely painless. If you feel any discomfort just let us know and we will adjust.',
  },
  {
    q: 'What payment methods do you accept?',
    a: 'Cash, UPI, debit/credit cards, and mobile wallets are accepted. Annual health plans can be paid in one go or discussed with our team.',
  },
  {
    q: 'Do I need to book in advance?',
    a: 'We recommend booking online to guarantee your preferred slot. Same-day appointments are often available. Call us or book in 60 seconds above.',
  },
  {
    q: 'How much does a root canal cost?',
    a: 'Root canal costs vary by tooth complexity and typically start from the range shown on the service card. The exact amount is confirmed before we begin. No surprises.',
  },
  {
    q: 'Are your tools properly sterilised?',
    a: 'Yes, always. Every instrument is sterilised in an autoclave after each patient. We follow strict infection-control protocols and never reuse disposables.',
  },
  {
    q: 'Can children be treated at your clinic?',
    a: 'Absolutely. We treat patients of all ages including young children. Our gentle approach and friendly team make dental visits comfortable for kids.',
  },
  {
    q: 'What if I need to cancel or reschedule?',
    a: 'You can manage your appointment online using your booking reference, or call us. We just ask for at least a few hours notice so we can offer the slot to another patient.',
  },
];
