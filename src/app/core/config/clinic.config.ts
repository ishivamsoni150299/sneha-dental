// ─────────────────────────────────────────────────────────────────────────────
// CLINIC CONFIG — Edit this file to customise for each clinic deployment.
// Keep only what genuinely differs between clinics. Generic content (WHY
// CHOOSE US, VALUES, TRUST BAR labels) is hardcoded in the components.
// ─────────────────────────────────────────────────────────────────────────────

export interface ClinicService { iconPath: string; name: string; description: string; benefit: string; price: string }
export interface HealthPlan    { tag: string; name: string; subtitle: string; price: string; period: string; highlighted: boolean; features: string[] }
export interface Testimonial   { name: string; location: string; rating: number; review: string }
export interface ClinicHours   { days: string; time: string }

export interface ClinicConfig {
  // ── Identity ──────────────────────────────────────────────────────────────
  name: string;
  doctorName: string;
  doctorQualification?: string;   // e.g. "BDS" — optional
  /** @deprecated Removed from UI. Kept optional for backwards-compat with existing Firestore docs. */
  doctorUniversity?: string;
  doctorBio: string[];            // paragraphs shown on About page
  patientCount: string;           // e.g. "1000+"  — used in trust bar & hero
  rating: string;                 // e.g. "4.9"   — shown on hero, about, testimonials

  // ── Contact ───────────────────────────────────────────────────────────────
  phone: string;                  // display  e.g. "+91 91402 10648"
  phoneE164: string;              // tel: link e.g. "919140210648"
  whatsappNumber: string;         // wa.me link e.g. "919140210648"
  addressLine1: string;
  addressLine2: string;
  city: string;
  mapEmbedUrl: string;
  mapDirectionsUrl: string;

  // ── Platform (set by business panel, not the clinic) ─────────────────────
  clinicId?: string;               // Firestore doc ID — used to scope appointments
  domain?: string;                 // custom domain  e.g. "snehadental.com"
  vercelDomain?: string;           // vercel preview  e.g. "sneha-dental.vercel.app"
  active?: boolean;                // false = paused deployment
  googlePlaceId?: string;          // Google Maps Place ID — used for reviews sync + map embed

  // ── Launch Mode ────────────────────────────────────────────────────────────
  comingSoon?: boolean;            // true = show "Launching Soon" page instead of full site
  launchDate?: string;             // ISO date e.g. "2026-05-01" — drives countdown timer

  // ── Voice Agent (ElevenLabs Conversational AI) ───────────────────────────
  elevenLabsAgentId?: string;      // ElevenLabs Convai agent ID for this clinic
  voiceAgentGreeting?: string;     // First message spoken by the agent
  voiceAgentLanguage?: 'hindi' | 'english' | 'bilingual'; // Conversation language
  voiceAgentPersona?: string;      // Extra system prompt instructions for the agent
  voiceAgentVoiceId?: string;      // ElevenLabs voice ID override
  voiceAgentWhatsapp?: string;     // WhatsApp number for AI channel (E164, no +)
  voiceMinutesUsed?: number;       // Current month minutes consumed (fetched from ElevenLabs)

  // ── Subscription & Billing (managed by platform admin) ───────────────────
  subscriptionPlan?:   'trial' | 'starter' | 'pro';
  subscriptionStatus?: 'trial' | 'active' | 'expired' | 'cancelled';
  trialEndDate?:       string;     // ISO date e.g. "2026-05-07"
  subscriptionEndDate?: string;    // ISO date — next renewal / expiry date
  billingCycle?:       'monthly' | 'yearly';
  lastPaymentDate?:    string;     // ISO date
  lastPaymentAmount?:  number;     // e.g. 499
  lastPaymentRef?:     string;     // Razorpay payment ID or "UPI-xxxx"
  billingEmail?:       string;
  billingNotes?:       string;     // free-text notes for manual tracking

  // ── Onboarding ────────────────────────────────────────────────────────────
  onboardingDismissed?:     boolean;  // admin dismissed the setup checklist
  onboardingSharedWebsite?: boolean;  // admin confirmed they shared the website

  // ── Brand ─────────────────────────────────────────────────────────────────
  theme: 'blue' | 'teal' | 'caramel' | 'emerald' | 'purple' | 'rose'; // default color theme for this deployment
  bookingRefPrefix: string;       // e.g. "SD" → generates "SD-A1B2C3D4"
  logoDataUrl?: string;           // base64 compressed logo (≤200×200 px) — overrides default tooth icon

  // ── Social ────────────────────────────────────────────────────────────────
  social: { facebook?: string; instagram?: string; linkedin?: string };

  // ── Clinic Hours ──────────────────────────────────────────────────────────
  hours: ClinicHours[];

  // ── Clinic-specific content ───────────────────────────────────────────────
  services: ClinicService[];      // full list — first 6 auto-shown on home page
  plans: HealthPlan[];
  testimonials: Testimonial[];
}

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT FALLBACK — empty shell used on localhost.
// On production, Firestore overwrites this before any component renders.
// Never shows real clinic data to end users via this file.
// ─────────────────────────────────────────────────────────────────────────────
export const clinicConfig: ClinicConfig = {

  name: '',
  doctorName: '',
  doctorBio:    [],
  patientCount: '',
  rating: '',

  phone:           '',
  phoneE164:       '',
  whatsappNumber:  '',
  addressLine1:    '',
  addressLine2:    '',
  city:            '',
  mapEmbedUrl:     '',
  mapDirectionsUrl: '',

  clinicId:           'default',
  theme:              'blue',
  bookingRefPrefix:   'BK',
  subscriptionPlan:   'trial',
  subscriptionStatus: 'trial',
  trialEndDate:       '',

  social: {},
  hours:        [],
  services:     [],
  plans:        [],
  testimonials: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// PLATFORM PLANS — pricing for the SaaS subscription (not clinic health plans)
// ─────────────────────────────────────────────────────────────────────────────
export const PLATFORM_PLANS = {
  trial:   { label: 'Free Trial', monthly: 0,   yearly: 0    },
  starter: { label: 'Starter',    monthly: 499, yearly: 4999 },
  pro:     { label: 'Pro',        monthly: 999, yearly: 9999 },
} as const;
