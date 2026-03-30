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
  doctorQualification: string;    // e.g. "BDS"
  doctorUniversity: string;
  doctorBio: string[];            // paragraphs shown on About page
  patientCount: string;           // e.g. "1000+"  — used in trust bar & hero

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

  // ── Brand ─────────────────────────────────────────────────────────────────
  theme: 'blue' | 'teal' | 'caramel'; // default color theme for this deployment
  bookingRefPrefix: string;       // e.g. "SD" → generates "SD-A1B2C3D4"

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
  doctorQualification: '',
  doctorUniversity: '',
  doctorBio:    [],
  patientCount: '',

  phone:           '',
  phoneE164:       '',
  whatsappNumber:  '',
  addressLine1:    '',
  addressLine2:    '',
  city:            '',
  mapEmbedUrl:     '',
  mapDirectionsUrl: '',

  clinicId:         'default',
  theme:            'blue',
  bookingRefPrefix: 'BK',

  social: {},
  hours:        [],
  services:     [],
  plans:        [],
  testimonials: [],
};
