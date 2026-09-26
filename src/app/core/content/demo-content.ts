/**
 * Centralised demo / marketing content.
 *
 * All fictional examples used to demonstrate the product UI live here.
 * Components should import from this barrel rather than defining demo data inline.
 *
 * IMPORTANT: Demo content must never enter production marketplace APIs.
 * Clinics with marketplace_status != 'verified' are excluded from search results.
 */

export const DEMO_WEBSITE_URL = 'https://arogyamdental.mydentalplatform.com';
export const DEMO_VIDEO_URL = 'https://youtu.be/cJGhGCDmyAk?si=lzHGpFTOp9WtMxMX';

export const DEMO_DISCLAIMER_TEXT =
  'These fictional examples demonstrate the product layout; they are not live clinics, reviews or appointment availability.';

export interface DemoShowcaseClinic {
  name: string;
  city: string;
  doctorName: string;
  speciality: string;
  testimonial: string;
  rating: number;
  patients: string;
}

export const DEMO_SHOWCASE_CLINICS: DemoShowcaseClinic[] = [
  {
    name: 'Sunrise Dental Care',
    city: 'Bengaluru',
    doctorName: 'Dr. Kavitha Reddy',
    speciality: 'Cosmetic Dentistry',
    testimonial: 'Patients love the gentle, transparent approach.',
    rating: 4.9,
    patients: '2 400+',
  },
  {
    name: 'Pearl Smile Clinic',
    city: 'Pune',
    doctorName: 'Dr. Rohan Mehta',
    speciality: 'Orthodontics',
    testimonial: 'Modern braces and aligners with a personal touch.',
    rating: 4.8,
    patients: '1 800+',
  },
  {
    name: 'DentCare Plus',
    city: 'Hyderabad',
    doctorName: 'Dr. Swati Rao',
    speciality: 'Implantology',
    testimonial: 'Full-mouth rehabilitation with cutting-edge implants.',
    rating: 4.7,
    patients: '3 100+',
  },
];
