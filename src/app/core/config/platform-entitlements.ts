export const PLATFORM_FEATURE_LABELS = {
  hostedWebsite: 'Clinic website on a mydentalplatform subdomain',
  onlineBooking: 'Online appointment booking',
  appointmentDashboard: 'Appointment management dashboard',
  whatsappContact: 'WhatsApp and contact integrations',
  patientRecords: 'Patient records and visit history',
  doctorManagement: 'Doctor profiles and schedules',
  customBranding: 'Custom logo and theme controls',
  removePlatformBranding: 'Remove mydentalplatform branding',
  customDomain: 'Custom domain with SSL',
  aiVoiceReceptionist: 'AI voice receptionist with 30 min/month',
  revenueInsights: 'Revenue and payment insights',
  prioritySupport: 'Priority support',
} as const;

export type PlatformFeatureId = keyof typeof PLATFORM_FEATURE_LABELS;
export type PlatformPlanId = 'trial' | 'starter' | 'pro';
export type PaidPlatformPlanId = Exclude<PlatformPlanId, 'trial'>;
export type PlatformBillingCycle = 'monthly' | 'yearly';
export type PlatformSubscriptionStatus = 'trial' | 'pending' | 'active' | 'expired' | 'cancelled';

export interface PlatformSubscriptionAccess {
  subscriptionPlan?: PlatformPlanId;
  subscriptionStatus?: PlatformSubscriptionStatus;
}

interface PlatformPlanDefinition {
  label: string;
  description: string;
  monthly: number;
  yearly: number;
  features: readonly PlatformFeatureId[];
}

export const PLATFORM_PLANS = {
  trial: {
    label: 'Free',
    description: 'Get your clinic online and start accepting appointments.',
    monthly: 0,
    yearly: 0,
    features: [
      'hostedWebsite',
      'onlineBooking',
      'appointmentDashboard',
      'whatsappContact',
    ],
  },
  starter: {
    label: 'Basic',
    description: 'Run your clinic with your own brand and operational tools.',
    monthly: 999,
    yearly: 9999,
    features: [
      'hostedWebsite',
      'onlineBooking',
      'appointmentDashboard',
      'whatsappContact',
      'patientRecords',
      'doctorManagement',
      'customBranding',
      'removePlatformBranding',
      'customDomain',
    ],
  },
  pro: {
    label: 'Pro',
    description: 'Add AI reception and deeper revenue insights.',
    monthly: 2499,
    yearly: 24999,
    features: [
      'hostedWebsite',
      'onlineBooking',
      'appointmentDashboard',
      'whatsappContact',
      'patientRecords',
      'doctorManagement',
      'customBranding',
      'removePlatformBranding',
      'customDomain',
      'aiVoiceReceptionist',
      'revenueInsights',
      'prioritySupport',
    ],
  },
} as const satisfies Record<PlatformPlanId, PlatformPlanDefinition>;

export function hasPlatformFeature(plan: PlatformPlanId, feature: PlatformFeatureId): boolean {
  return (PLATFORM_PLANS[plan].features as readonly PlatformFeatureId[]).includes(feature);
}

export function resolvePlatformPlan(
  plan: PlatformPlanId | undefined,
  status: PlatformSubscriptionStatus | undefined,
): PlatformPlanId {
  return (plan === 'starter' || plan === 'pro') && status === 'active' ? plan : 'trial';
}

export function clinicHasPlatformFeature(
  config: PlatformSubscriptionAccess,
  feature: PlatformFeatureId,
): boolean {
  return hasPlatformFeature(
    resolvePlatformPlan(config.subscriptionPlan, config.subscriptionStatus),
    feature,
  );
}

export function getPlatformPlanFeatureLabels(plan: PlatformPlanId): string[] {
  return PLATFORM_PLANS[plan].features.map(feature => PLATFORM_FEATURE_LABELS[feature]);
}

export function getPlatformPlanAmount(
  plan: PlatformPlanId,
  billingCycle: PlatformBillingCycle,
): number {
  return PLATFORM_PLANS[plan][billingCycle];
}

export function formatPlatformPlanPrice(
  plan: PlatformPlanId,
  billingCycle: PlatformBillingCycle,
  includePeriod = true,
): string {
  const amount = getPlatformPlanAmount(plan, billingCycle).toLocaleString('en-IN');
  const suffix = billingCycle === 'yearly' ? '/year' : '/month';
  return includePeriod ? `₹${amount}${suffix}` : `₹${amount}`;
}