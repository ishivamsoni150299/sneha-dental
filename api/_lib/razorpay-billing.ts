import Razorpay from 'razorpay';

export type BillingPlan = 'starter' | 'pro';
export type BillingCycle = 'monthly' | 'yearly';
export type PaymentMode = 'subscription' | 'manual';

interface BillingPlanMeta {
  amount: number;
  label: string;
  cycleLabel: string;
  periodLabel: string;
  envKeys: string[];
}

const PLAN_META: Record<BillingPlan, Record<BillingCycle, BillingPlanMeta>> = {
  starter: {
    monthly: {
      amount: 999,
      label: 'Starter',
      cycleLabel: 'monthly',
      periodLabel: 'month',
      envKeys: ['RAZORPAY_PLAN_STARTER_MONTHLY', 'RAZORPAY_PLAN_STARTER'],
    },
    yearly: {
      amount: 9999,
      label: 'Starter',
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
      envKeys: ['RAZORPAY_PLAN_PRO_MONTHLY', 'RAZORPAY_PLAN_PRO'],
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

export function getBillingPlanDetails(plan: BillingPlan, billingCycle: BillingCycle): BillingPlanDetails {
  const meta = PLAN_META[plan][billingCycle];
  const planId = firstEnvValue(meta.envKeys);

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
  return process.env['PUBLIC_RAZORPAY_ME_URL']?.trim()
    || process.env['RAZORPAY_ME_URL']?.trim()
    || null;
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

export async function createRazorpayCheckout(input: CreateCheckoutInput): Promise<RazorpayCheckoutResult> {
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
      : details.missingEnvKey;
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
