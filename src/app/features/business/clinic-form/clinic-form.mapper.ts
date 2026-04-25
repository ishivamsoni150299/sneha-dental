import type { ClinicCustomization, ClinicTheme } from '../../../core/config/clinic.config';

export interface ClinicImageFormValue {
  src: string;
  alt: string;
  label: string;
}

export interface ClinicFormRawValue {
  name: string;
  doctorName: string;
  doctorQualification: string;
  patientCount: string;
  phone: string;
  phoneE164: string;
  whatsappNumber: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  mapEmbedUrl: string;
  mapDirectionsUrl: string;
  googlePlaceId: string;
  domain: string;
  active: boolean;
  subscriptionPlan: 'trial' | 'starter' | 'pro';
  subscriptionStatus: 'trial' | 'active' | 'expired' | 'cancelled';
  billingCycle: 'monthly' | 'yearly';
  trialEndDate: string;
  subscriptionEndDate: string;
  lastPaymentDate: string;
  lastPaymentAmount: number | null;
  lastPaymentRef: string;
  billingEmail: string;
  billingNotes: string;
  theme: ClinicTheme;
  bookingRefPrefix: string;
  facebook: string;
  instagram: string;
  linkedin: string;
  doctorBio: string[];
  hours: { days: string; time: string }[];
  services: unknown[];
  plans: Record<string, unknown>[];
  testimonials: unknown[];
  homeEyebrow: string;
  homeHeroTitle: string;
  homeHeroHighlight: string;
  homeHeroSubtitle: string;
  homeDoctorQuote: string;
  homeWhyTitle: string;
  homeWhyBody: string;
  homeFinalCtaTitle: string;
  homeFinalCtaSubtitle: string;
  firstTouchWhatsapp: string;
  followupWhatsapp: string;
  knowledgeTreatmentFocus: string;
  knowledgeLanguages: string;
  knowledgeConsultationFee: string;
  knowledgePriceGuidance: string;
  knowledgePaymentOptions: string;
  knowledgeEmergencyPolicy: string;
  knowledgeAppointmentPolicy: string;
  knowledgeInsurancePolicy: string;
  knowledgeParkingInfo: string;
  knowledgeAccessibilityInfo: string;
  knowledgePatientNotes: string;
  clinicImages: ClinicImageFormValue[];
}

export interface BuildClinicPayloadInput {
  values: ClinicFormRawValue;
  hostedDomain: string;
  ownerEmail: string;
  existingCustomization?: ClinicCustomization;
}

export type ClinicFirestorePayload = Record<string, unknown>;

function optionalText(value: string): string | null {
  return value.trim() || null;
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

export function buildClinicFirestorePayload({
  values: v,
  hostedDomain,
  ownerEmail,
  existingCustomization,
}: BuildClinicPayloadInput): ClinicFirestorePayload {
  const customization = existingCustomization ?? {};
  const existingHome = customization.content?.home ?? {};
  const clinicImages = v.clinicImages
    .map(image => ({
      src: image.src.trim(),
      alt: image.alt.trim(),
      label: image.label.trim(),
    }))
    .filter(image => image.src && image.alt);

  return {
    name:                v.name,
    doctorName:          v.doctorName,
    doctorQualification: v.doctorQualification || null,
    patientCount:        v.patientCount        || null,
    phone:               v.phone,
    phoneE164:           v.phoneE164           || null,
    whatsappNumber:      v.whatsappNumber      || null,
    addressLine1:        v.addressLine1,
    addressLine2:        v.addressLine2        || null,
    city:                v.city,
    mapEmbedUrl:         v.mapEmbedUrl         || null,
    mapDirectionsUrl:    v.mapDirectionsUrl    || null,
    googlePlaceId:       v.googlePlaceId       || null,
    subscriptionPlan:    v.subscriptionPlan,
    subscriptionStatus:  v.subscriptionStatus,
    billingCycle:        v.billingCycle,
    trialEndDate:        v.trialEndDate         || null,
    subscriptionEndDate: v.subscriptionEndDate  || null,
    lastPaymentDate:     v.lastPaymentDate      || null,
    lastPaymentAmount:   v.lastPaymentAmount    ?? null,
    lastPaymentRef:      v.lastPaymentRef       || null,
    billingEmail:        v.billingEmail || ownerEmail || null,
    billingNotes:        v.billingNotes         || null,
    domain:              v.domain               || null,
    vercelDomain:        hostedDomain           || null,
    active:              v.active,
    theme:               v.theme,
    bookingRefPrefix:    v.bookingRefPrefix,
    social: {
      facebook:  v.facebook  || null,
      instagram: v.instagram || null,
      linkedin:  v.linkedin  || null,
    },
    doctorBio: v.doctorBio
      .map(paragraph => paragraph.trim())
      .filter(Boolean),
    hours: v.hours.filter(slot => slot.days.trim() || slot.time.trim()),
    services:     v.services,
    plans:        v.plans.map(plan => ({
      ...plan,
      features: plan['features'] as string[],
    })),
    testimonials: v.testimonials,
    customization: {
      ...customization,
      content: {
        ...(customization.content ?? {}),
        home: {
          ...existingHome,
          eyebrow: optionalText(v.homeEyebrow),
          heroTitle: optionalText(v.homeHeroTitle),
          heroHighlight: optionalText(v.homeHeroHighlight),
          heroSubtitle: optionalText(v.homeHeroSubtitle),
          doctorQuote: optionalText(v.homeDoctorQuote),
          whyTitle: optionalText(v.homeWhyTitle),
          whyBody: optionalText(v.homeWhyBody),
          finalCtaTitle: optionalText(v.homeFinalCtaTitle),
          finalCtaSubtitle: optionalText(v.homeFinalCtaSubtitle),
        },
      },
      media: {
        ...(customization.media ?? {}),
        clinicImages,
      },
      communication: {
        ...(customization.communication ?? {}),
        firstTouchWhatsapp: optionalText(v.firstTouchWhatsapp),
        followupWhatsapp: optionalText(v.followupWhatsapp),
      },
      knowledge: {
        ...(customization.knowledge ?? {}),
        treatmentFocus: splitList(v.knowledgeTreatmentFocus),
        languages: splitList(v.knowledgeLanguages),
        consultationFee: optionalText(v.knowledgeConsultationFee),
        priceGuidance: optionalText(v.knowledgePriceGuidance),
        paymentOptions: splitList(v.knowledgePaymentOptions),
        emergencyPolicy: optionalText(v.knowledgeEmergencyPolicy),
        appointmentPolicy: optionalText(v.knowledgeAppointmentPolicy),
        insurancePolicy: optionalText(v.knowledgeInsurancePolicy),
        parkingInfo: optionalText(v.knowledgeParkingInfo),
        accessibilityInfo: optionalText(v.knowledgeAccessibilityInfo),
        patientNotes: optionalText(v.knowledgePatientNotes),
      },
    },
  };
}
