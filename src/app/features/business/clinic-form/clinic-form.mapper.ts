import {
  MARKETPLACE_DENTAL_SERVICES,
  type ClinicCustomization,
  type ClinicTheme,
  type MarketplaceDentalServiceId,
  type MarketplaceListingAdminUpdate,
  type MarketplaceListingStatus,
  type MarketplacePaymentMethod,
  type MarketplaceRegionId,
} from '../../../core/config/clinic.config';

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
  subscriptionStatus: 'trial' | 'pending' | 'active' | 'expired' | 'cancelled';
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

export interface MarketplaceFormRawValue {
  marketplaceStatus: string;
  marketplaceSlug: string;
  marketplaceRegion: string;
  marketplaceLocality: string;
  marketplaceLatitude: number | null;
  marketplaceLongitude: number | null;
  marketplaceServiceIds: string[];
  marketplaceLanguages: string;
  marketplaceConsultationFee: number | null;
  marketplacePaymentMethods: string[];
  marketplaceAcceptingNewPatients: boolean;
  marketplaceListingImageUrl: string;
  marketplaceVerifiedDoctorIds: string;
  verificationRegistrationNumber: string;
  verificationRegistrationCouncil: string;
  verificationClinicAddress: boolean;
  verificationPhone: boolean;
  verificationNotes: string;
}

export interface BuildClinicPayloadInput {
  values: ClinicFormRawValue;
  hostedDomain: string;
  ownerEmail: string;
  existingCustomization?: ClinicCustomization;
}

export type ClinicApiPayload = Record<string, unknown>;

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

function optionalNumber(value: number | null, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : null;
}

export function buildMarketplaceListingUpdate(
  values: MarketplaceFormRawValue,
  principalDentistName: string,
  googlePlaceId: string,
): MarketplaceListingAdminUpdate {
  const allowedServices = new Set<string>(MARKETPLACE_DENTAL_SERVICES.map(service => service.id));
  const serviceIds = [...new Set(values.marketplaceServiceIds)]
    .filter((serviceId): serviceId is MarketplaceDentalServiceId => allowedServices.has(serviceId));
  const allowedPaymentMethods = new Set<MarketplacePaymentMethod>(['cash', 'upi', 'card', 'insurance']);
  const paymentMethods = [...new Set(values.marketplacePaymentMethods)]
    .filter((method): method is MarketplacePaymentMethod => allowedPaymentMethods.has(method as MarketplacePaymentMethod));
  const status = ['unlisted', 'pending', 'verified', 'suspended'].includes(values.marketplaceStatus)
    ? values.marketplaceStatus as MarketplaceListingStatus
    : 'unlisted';
  const locality = values.marketplaceLocality.trim();
  const hasProfileData = Boolean(
    locality || serviceIds.length || values.marketplaceLanguages.trim() ||
    values.marketplaceConsultationFee || values.marketplaceListingImageUrl.trim(),
  );

  return {
    status,
    slug: values.marketplaceSlug.trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || null,
    verifiedDoctorIds: [...new Set(splitList(values.marketplaceVerifiedDoctorIds))],
    profile: status === 'unlisted' && !hasProfileData ? null : {
      region: (values.marketplaceRegion === 'delhi-ncr'
        ? values.marketplaceRegion
        : 'delhi-ncr') as MarketplaceRegionId,
      locality,
      latitude: optionalNumber(values.marketplaceLatitude, -90, 90),
      longitude: optionalNumber(values.marketplaceLongitude, -180, 180),
      serviceIds,
      languages: splitList(values.marketplaceLanguages).slice(0, 8),
      consultationFee: optionalNumber(values.marketplaceConsultationFee, 0, 100000),
      paymentMethods,
      acceptingNewPatients: values.marketplaceAcceptingNewPatients,
      listingImageUrl: optionalText(values.marketplaceListingImageUrl),
    },
    verification: {
      principalDentistName: principalDentistName.trim(),
      registrationNumber: values.verificationRegistrationNumber.trim(),
      registrationCouncil: values.verificationRegistrationCouncil.trim(),
      clinicAddressVerified: values.verificationClinicAddress,
      phoneVerified: values.verificationPhone,
      googlePlaceId: optionalText(googlePlaceId),
      notes: optionalText(values.verificationNotes),
    },
  };
}

export function buildClinicApiPayload({
  values: v,
  hostedDomain,
  ownerEmail,
  existingCustomization,
}: BuildClinicPayloadInput): ClinicApiPayload {
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
    hostedDomain:        hostedDomain           || null,
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
