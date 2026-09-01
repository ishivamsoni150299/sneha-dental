import Razorpay from 'razorpay';

export type BillingPlan = 'starter' | 'pro';
export type BillingCycle = 'monthly' | 'yearly';
export type PaymentMode = 'subscription' | 'manual';

export interface BillingSubscriptionMetadata {
  clinicId: string;
  plan: BillingPlan;
  billingCycle: BillingCycle;
}

export type BillingWebhookEventKind = 'pending' | 'activate' | 'terminate';
export type BillingWebhookAction = 'apply' | 'keep-current' | 'clear-pending' | 'ignore-stale';

interface BillingPlanMeta {
  amount: number;
  label: string;
  cycleLabel: string;
  periodLabel: string;
  envKeys: string[];
  defaultPlanId?: string;
}

const PLAN_META: Record<BillingPlan, Record<BillingCycle, BillingPlanMeta>> = {
  starter: {
    monthly: {
      amount: 999,
      label: 'Basic',
      cycleLabel: 'monthly',
      periodLabel: 'month',
      envKeys: ['RAZORPAY_PLAN_STARTER_MONTHLY'],
      defaultPlanId: 'plan_ShGxRJzXZynEts',
    },
    yearly: {
      amount: 9999,
      label: 'Basic',
      cycleLabel: 'yearly',
      periodLabel: 'year',
      envKeys: ['RAZORPAY_PLAN_STARTER_YEARLY'],
    },
  },
  pro: {
    monthly: {
      amount: 2499,
      label: 'Pro',
      cycleLabel: 'monthly',
      periodLabel: 'month',
      envKeys: ['RAZORPAY_PLAN_PRO_MONTHLY'],
      defaultPlanId: 'plan_ShGumDVvGT5kJz',
    },
    yearly: {
      amount: 24999,
      label: 'Pro',
      cycleLabel: 'yearly',
      periodLabel: 'year',
      envKeys: ['RAZORPAY_PLAN_PRO_YEARLY'],
    },
  },
};

export interface BillingPlanDetails {
  plan: BillingPlan;
  billingCycle: BillingCycle;
  amount: number;
  label: string;
  cycleLabel: string;
  periodLabel: string;
  planId: string | null;
  missingEnvKey: string | null;
}

export interface RazorpayCheckoutResult {
  subscriptionId: string | null;
  paymentUrl: string;
  manualPaymentUrl: string | null;
  paymentMode: PaymentMode;
  amount: number;
  planLabel: string;
  billingCycle: BillingCycle;
}

export interface CreateCheckoutInput {
  clinicId: string;
  clinicName: string;
  plan: BillingPlan;
  billingCycle: BillingCycle;
  phone?: string;
}

function firstEnvValue(keys: string[]): string | null {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return null;
}

export function parseBillingSubscriptionMetadata(value: unknown): BillingSubscriptionMetadata | null {
  if (typeof value !== 'object' || value === null) return null;

  const notes = value as Record<string, unknown>;
  const clinicId = typeof notes['clinicId'] === 'string' ? notes['clinicId'].trim() : '';
  const plan = notes['plan'];
  const billingCycle = notes['billingCycle'];
  if (!clinicId || clinicId.length > 128 || clinicId.includes('/')) return null;
  if (plan !== 'starter' && plan !== 'pro') return null;
  if (billingCycle !== 'monthly' && billingCycle !== 'yearly') return null;

  return { clinicId, plan, billingCycle };
}

export function resolveBillingWebhookAction(
  currentSubscriptionId: unknown,
  pendingSubscriptionId: unknown,
  incomingSubscriptionId: string,
  eventKind: BillingWebhookEventKind,
): BillingWebhookAction {
  const currentId = typeof currentSubscriptionId === 'string' ? currentSubscriptionId : '';
  const pendingId = typeof pendingSubscriptionId === 'string' ? pendingSubscriptionId : '';
  const matchesCurrent = currentId === incomingSubscriptionId;
  const matchesPending = pendingId === incomingSubscriptionId;

  if ((currentId || pendingId) && !matchesCurrent && !matchesPending) return 'ignore-stale';
  if (matchesPending && currentId && !matchesCurrent) {
    if (eventKind === 'pending') return 'keep-current';
    if (eventKind === 'terminate') return 'clear-pending';
  }
  return 'apply';
}

export function getBillingPlanDetails(plan: BillingPlan, billingCycle: BillingCycle): BillingPlanDetails {
  const meta = PLAN_META[plan][billingCycle];
  const planId = firstEnvValue(meta.envKeys) ?? meta.defaultPlanId ?? null;

  return {
    plan,
    billingCycle,
    amount: meta.amount,
    label: meta.label,
    cycleLabel: meta.cycleLabel,
    periodLabel: meta.periodLabel,
    planId,
    missingEnvKey: planId ? null : meta.envKeys[0],
  };
}

export function getManualPaymentUrl(): string | null {
  return firstEnvValue(['PUBLIC_RAZORPAY_ME_URL', 'RAZORPAY_ME_URL']);
}

export function nextBillingDateIso(billingCycle: BillingCycle, from = new Date()): string {
  const next = new Date(from);
  if (billingCycle === 'yearly') {
    next.setFullYear(next.getFullYear() + 1);
  } else {
    next.setMonth(next.getMonth() + 1);
  }
  return next.toISOString().slice(0, 10);
}

export function razorpaySubscriptionEndDateIso(
  currentEnd: unknown,
  billingCycle: BillingCycle,
  from = new Date(),
): string {
  if (typeof currentEnd === 'number' && Number.isFinite(currentEnd) && currentEnd > 0) {
    const providerEnd = new Date(currentEnd * 1000);
    if (!Number.isNaN(providerEnd.getTime())) return providerEnd.toISOString().slice(0, 10);
  }

  return nextBillingDateIso(billingCycle, from);
}

export async function createRazorpayCheckout(input: CreateCheckoutInput): Promise<RazorpayCheckoutResult> {
  if (input.billingCycle !== 'monthly') {
    throw new Error('Yearly Razorpay subscriptions are temporarily disabled. Use monthly billing.');
  }

  const details = getBillingPlanDetails(input.plan, input.billingCycle);
  const manualPaymentUrl = getManualPaymentUrl();

  if (!process.env['RAZORPAY_KEY_ID'] || !process.env['RAZORPAY_KEY_SECRET'] || !details.planId) {
    if (manualPaymentUrl) {
      return {
        subscriptionId: null,
        paymentUrl: manualPaymentUrl,
        manualPaymentUrl,
        paymentMode: 'manual',
        amount: details.amount,
        planLabel: details.label,
        billingCycle: details.billingCycle,
      };
    }

    const missing = !process.env['RAZORPAY_KEY_ID'] || !process.env['RAZORPAY_KEY_SECRET']
      ? 'RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET'
      : (details.missingEnvKey ?? 'RAZORPAY_PLAN_*');
    throw new Error(`Payment not configured. Set ${missing}.`);
  }

  const razorpay = new Razorpay({
    key_id: process.env['RAZORPAY_KEY_ID'].trim(),
    key_secret: process.env['RAZORPAY_KEY_SECRET'].trim(),
  });

  const subscription = await razorpay.subscriptions.create({
    plan_id: details.planId,
    total_count: details.billingCycle === 'yearly' ? 10 : 120,
    quantity: 1,
    ...(input.phone ? { notify_info: { notify_phone: input.phone } } : {}),
    notes: {
      clinicId: input.clinicId,
      clinicName: input.clinicName || input.clinicId,
      plan: input.plan,
      billingCycle: input.billingCycle,
    },
  });

  const paymentUrl = (subscription as unknown as Record<string, unknown>)['short_url'];
  if (typeof paymentUrl !== 'string' || !paymentUrl.trim()) {
    throw new Error('Razorpay did not return a hosted checkout URL.');
  }

  return {
    subscriptionId: subscription.id,
    paymentUrl,
    manualPaymentUrl,
    paymentMode: 'subscription',
    amount: details.amount,
    planLabel: details.label,
    billingCycle: details.billingCycle,
  };
}
