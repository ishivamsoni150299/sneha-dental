import { Injectable } from '@angular/core';
import { formatPlatformPlanPrice, getPlatformPlanAmount } from '../config/clinic.config';

export type BillingPlan = 'starter' | 'pro';
export type BillingCycle = 'monthly' | 'yearly';
export type PaymentMode = 'subscription' | 'manual';

export interface SubscriptionResult {
  subscriptionId: string | null;
  paymentUrl: string;
  shortUrl: string;
  paymentMode: PaymentMode;
  manualPaymentUrl: string | null;
  billingCycle: BillingCycle;
  amount: number;
}

@Injectable({ providedIn: 'root' })
export class BillingService {
  async createSubscription(
    clinicId: string,
    plan: BillingPlan,
    billingCycle: BillingCycle,
    clinicName: string,
    phone?: string,
  ): Promise<SubscriptionResult> {
    const res = await fetch('/api/create-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clinicId, plan, billingCycle, clinicName, phone }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as Record<string, string>)['error'] ?? 'Failed to create subscription');
    }

    return res.json() as Promise<SubscriptionResult>;
  }

  planAmount(plan: BillingPlan, billingCycle: BillingCycle): number {
    return getPlatformPlanAmount(plan, billingCycle);
  }

  planLabel(plan: BillingPlan, billingCycle: BillingCycle): string {
    const title = plan === 'pro' ? 'Pro' : 'Starter';
    return `${title} (${formatPlatformPlanPrice(plan, billingCycle)})`;
  }

  whatsappPaymentMessage(
    clinicName: string,
    plan: BillingPlan,
    billingCycle: BillingCycle,
    paymentUrl: string,
    paymentMode: PaymentMode,
  ): string {
    const planLabel = this.planLabel(plan, billingCycle);

    const message = paymentMode === 'subscription'
      ? `Hi ${clinicName} team!\n\nYour mydentalplatform ${planLabel} checkout is ready.\n\nUse the secure Razorpay link below to activate your plan. After the first payment, Razorpay will handle future ${billingCycle} renewals automatically.\n\n${paymentUrl}\n\nNo setup fee. Cancel anytime.`
      : `Hi ${clinicName} team!\n\nYour mydentalplatform ${planLabel} payment link is ready.\n\nUse the Razorpay.me link below to complete payment:\n\n${paymentUrl}\n\nAfter payment, please share the payment confirmation so we can verify and activate the plan quickly.`;

    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  }
}
