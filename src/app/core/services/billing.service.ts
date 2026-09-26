import { Injectable, inject } from '@angular/core';
import { formatPlatformPlanPrice, getPlatformPlanAmount } from '../config/clinic.config';
import { AuthenticatedApiService } from './authenticated-api.service';

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

export interface SubscriptionStatus {
  subscriptionId?: string | null;
  status?: string;
  cancellationEffectiveAt?: string | null;
}

@Injectable({ providedIn: 'root' })
export class BillingService {
  private readonly api = inject(AuthenticatedApiService);

  async currentSubscription(): Promise<SubscriptionStatus> {
    const res = await this.api.fetch('/api/billing/subscriptions/current');
    if (!res.ok) throw new Error('Could not load subscription status.');
    return res.json() as Promise<SubscriptionStatus>;
  }

  async cancelSubscription(id: string): Promise<{ status: string; effectiveAt: string }> {
    const res = await this.api.fetch(`/api/billing/subscriptions/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
    if (!res.ok) {
      const error = await res.json().catch(() => ({})) as { detail?: string; message?: string };
      throw new Error(error.detail || error.message || 'Could not schedule cancellation.');
    }
    return res.json() as Promise<{ status: string; effectiveAt: string }>;
  }

  async createSubscription(
    clinicId: string,
    plan: BillingPlan,
    billingCycle: BillingCycle,
    _clinicName: string,
    _phone?: string,
  ): Promise<SubscriptionResult> {
    const res = await this.api.fetch('/api/billing/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clinicId, plan, billingCycle }),
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
    const title = plan === 'pro' ? 'Pro' : 'Basic';
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
