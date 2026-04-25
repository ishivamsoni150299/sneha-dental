import {
  buildClinicFirestorePayload,
  type ClinicFormRawValue,
} from './clinic-form.mapper';

interface ClinicPayloadCustomization {
  content: {
    home: {
      eyebrow: string | null;
      heroTitle: string | null;
      heroHighlight: string | null;
      heroSubtitle: string | null;
      doctorQuote: string | null;
      whyTitle: string | null;
      whyBody: string | null;
      finalCtaTitle: string | null;
      finalCtaSubtitle: string | null;
      faqs?: { q: string; a: string }[];
    };
  };
  media: {
    clinicImages: { src: string; alt: string; label: string }[];
  };
  communication: {
    firstTouchWhatsapp: string | null;
    followupWhatsapp: string | null;
  };
  knowledge: {
    treatmentFocus: string[];
    languages: string[];
    consultationFee: string | null;
    priceGuidance: string | null;
    paymentOptions: string[];
    emergencyPolicy: string | null;
    appointmentPolicy: string | null;
    insurancePolicy: string | null;
    parkingInfo: string | null;
    accessibilityInfo: string | null;
    patientNotes: string | null;
  };
}

interface ClinicPayload {
  name: string;
  doctorQualification: string | null;
  patientCount: string | null;
  phoneE164: string | null;
  whatsappNumber: string | null;
  addressLine2: string | null;
  mapEmbedUrl: string | null;
  mapDirectionsUrl: string | null;
  googlePlaceId: string | null;
  trialEndDate: string | null;
  subscriptionEndDate: string | null;
  lastPaymentDate: string | null;
  lastPaymentAmount: number | null;
  lastPaymentRef: string | null;
  billingEmail: string | null;
  billingNotes: string | null;
  domain: string | null;
  vercelDomain: string | null;
  social: {
    facebook: string | null;
    instagram: string | null;
    linkedin: string | null;
  };
  doctorBio: string[];
  hours: { days: string; time: string }[];
  plans: {
    tag: string;
    name: string;
    subtitle: string;
    price: string;
    period: string;
    highlighted: boolean;
    features: string[];
  }[];
  customization: ClinicPayloadCustomization;
}

function buildRawValue(overrides: Partial<ClinicFormRawValue> = {}): ClinicFormRawValue {
  return {
    name: 'Aarogyam Smile Dental Clinic',
    doctorName: 'Dr. Priya Mehta',
    doctorQualification: '',
    patientCount: '',
    phone: '+91 90000 00000',
    phoneE164: '',
    whatsappNumber: '',
    addressLine1: 'Vaishali Nagar',
    addressLine2: '',
    city: 'Jaipur',
    mapEmbedUrl: '',
    mapDirectionsUrl: '',
    googlePlaceId: '',
    domain: '',
    active: true,
    subscriptionPlan: 'starter',
    subscriptionStatus: 'active',
    billingCycle: 'monthly',
    trialEndDate: '',
    subscriptionEndDate: '',
    lastPaymentDate: '',
    lastPaymentAmount: null,
    lastPaymentRef: '',
    billingEmail: '',
    billingNotes: '',
    theme: 'blue',
    bookingRefPrefix: 'AS',
    facebook: '',
    instagram: 'https://instagram.com/aarogyam',
    linkedin: '',
    doctorBio: [' Experienced endodontist ', '', ' Focused on calm patient care. '],
    hours: [
      { days: 'Monday - Saturday', time: '9:00 AM - 8:00 PM' },
      { days: '', time: '' },
      { days: 'Sunday', time: '' },
    ],
    services: [
      {
        iconPath: '/icons/root-canal.svg',
        name: 'Root Canal',
        description: 'Pain-free RCT',
        benefit: 'Save your natural tooth',
        price: 'From Rs. 3,999',
      },
    ],
    plans: [
      {
        tag: 'Popular',
        name: 'Family Care',
        subtitle: 'Preventive visits',
        price: '999',
        period: 'month',
        highlighted: true,
        features: ['Cleaning', 'Checkup'],
      },
    ],
    testimonials: [
      {
        name: 'Anita',
        location: 'Jaipur',
        rating: 5,
        review: 'Very calm experience.',
      },
    ],
    homeEyebrow: ' Dental excellence ',
    homeHeroTitle: 'Pain-free care',
    homeHeroHighlight: 'you can trust',
    homeHeroSubtitle: 'Modern clinic with transparent pricing.',
    homeDoctorQuote: '',
    homeWhyTitle: 'Why families choose us',
    homeWhyBody: 'Sterilized tools and honest advice.',
    homeFinalCtaTitle: 'Book in 60 seconds',
    homeFinalCtaSubtitle: '',
    firstTouchWhatsapp: ' Hi {{clinicName}}, I saw your clinic in {{city}}. ',
    followupWhatsapp: '',
    knowledgeTreatmentFocus:
      'RCT, Implants, Aligners, Cleaning, Whitening, Kids dentistry, Extraction, Fillings, Crowns, Bridges, Dentures, Smile design, Gum care',
    knowledgeLanguages: 'Hindi, English, , Rajasthani',
    knowledgeConsultationFee: '',
    knowledgePriceGuidance: 'Share exact pricing after doctor review.',
    knowledgePaymentOptions: 'UPI, Card, Cash',
    knowledgeEmergencyPolicy: 'Call for urgent dental pain.',
    knowledgeAppointmentPolicy: '',
    knowledgeInsurancePolicy: '',
    knowledgeParkingInfo: 'Basement parking available.',
    knowledgeAccessibilityInfo: '',
    knowledgePatientNotes: 'First-time patients should bring old X-rays.',
    clinicImages: [
      { src: ' https://example.com/reception.jpg ', alt: ' Reception area ', label: ' Front desk ' },
      { src: '', alt: 'Operatory', label: 'Room' },
      { src: 'https://example.com/chair.jpg', alt: '', label: 'Chair' },
    ],
    ...overrides,
  };
}

function buildPayload(
  overrides: Partial<ClinicFormRawValue> = {},
  ownerEmail = 'owner@clinic.test',
): ClinicPayload {
  return buildClinicFirestorePayload({
    values: buildRawValue(overrides),
    hostedDomain: 'aarogyamdental.mydentalplatform.com',
    ownerEmail,
    existingCustomization: {
      content: {
        home: {
          faqs: [{ q: 'Do you take emergencies?', a: 'Yes, call before visiting.' }],
        },
      },
      knowledge: {
        patientNotes: 'Old notes should be replaced by form value.',
      },
    },
  }) as unknown as ClinicPayload;
}

describe('buildClinicFirestorePayload', () => {
  it('keeps clinic save fields Firestore-safe without losing useful form data', () => {
    const payload = buildPayload();

    expect(payload.name).toBe('Aarogyam Smile Dental Clinic');
    expect(payload.doctorQualification).toBeNull();
    expect(payload.patientCount).toBeNull();
    expect(payload.phoneE164).toBeNull();
    expect(payload.whatsappNumber).toBeNull();
    expect(payload.addressLine2).toBeNull();
    expect(payload.mapEmbedUrl).toBeNull();
    expect(payload.mapDirectionsUrl).toBeNull();
    expect(payload.googlePlaceId).toBeNull();
    expect(payload.trialEndDate).toBeNull();
    expect(payload.subscriptionEndDate).toBeNull();
    expect(payload.lastPaymentDate).toBeNull();
    expect(payload.lastPaymentAmount).toBeNull();
    expect(payload.lastPaymentRef).toBeNull();
    expect(payload.billingEmail).toBe('owner@clinic.test');
    expect(payload.billingNotes).toBeNull();
    expect(payload.domain).toBeNull();
    expect(payload.vercelDomain).toBe('aarogyamdental.mydentalplatform.com');
    expect(payload.social).toEqual({
      facebook: null,
      instagram: 'https://instagram.com/aarogyam',
      linkedin: null,
    });
    expect(payload.doctorBio).toEqual([
      'Experienced endodontist',
      'Focused on calm patient care.',
    ]);
    expect(payload.hours).toEqual([
      { days: 'Monday - Saturday', time: '9:00 AM - 8:00 PM' },
      { days: 'Sunday', time: '' },
    ]);
    expect(payload.plans).toEqual([
      {
        tag: 'Popular',
        name: 'Family Care',
        subtitle: 'Preventive visits',
        price: '999',
        period: 'month',
        highlighted: true,
        features: ['Cleaning', 'Checkup'],
      },
    ]);
  });

  it('preserves existing home customization while applying editable clinic overrides', () => {
    const payload = buildPayload();

    expect(payload.customization.content.home).toEqual({
      faqs: [{ q: 'Do you take emergencies?', a: 'Yes, call before visiting.' }],
      eyebrow: 'Dental excellence',
      heroTitle: 'Pain-free care',
      heroHighlight: 'you can trust',
      heroSubtitle: 'Modern clinic with transparent pricing.',
      doctorQuote: null,
      whyTitle: 'Why families choose us',
      whyBody: 'Sterilized tools and honest advice.',
      finalCtaTitle: 'Book in 60 seconds',
      finalCtaSubtitle: null,
    });
  });

  it('sanitizes media, WhatsApp copy, and AI knowledge used by client websites', () => {
    const payload = buildPayload();

    expect(payload.customization.media.clinicImages).toEqual([
      {
        src: 'https://example.com/reception.jpg',
        alt: 'Reception area',
        label: 'Front desk',
      },
    ]);
    expect(payload.customization.communication).toEqual({
      firstTouchWhatsapp: 'Hi {{clinicName}}, I saw your clinic in {{city}}.',
      followupWhatsapp: null,
    });
    expect(payload.customization.knowledge.treatmentFocus).toEqual([
      'RCT',
      'Implants',
      'Aligners',
      'Cleaning',
      'Whitening',
      'Kids dentistry',
      'Extraction',
      'Fillings',
      'Crowns',
      'Bridges',
      'Dentures',
      'Smile design',
    ]);
    expect(payload.customization.knowledge.languages).toEqual([
      'Hindi',
      'English',
      'Rajasthani',
    ]);
    expect(payload.customization.knowledge.consultationFee).toBeNull();
    expect(payload.customization.knowledge.priceGuidance)
      .toBe('Share exact pricing after doctor review.');
    expect(payload.customization.knowledge.paymentOptions).toEqual(['UPI', 'Card', 'Cash']);
    expect(payload.customization.knowledge.appointmentPolicy).toBeNull();
    expect(payload.customization.knowledge.patientNotes)
      .toBe('First-time patients should bring old X-rays.');
  });

  it('prefers an explicit billing email over the owner login fallback', () => {
    const payload = buildPayload({ billingEmail: 'billing@clinic.test' });

    expect(payload.billingEmail).toBe('billing@clinic.test');
  });
});
