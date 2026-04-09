import { Injectable } from '@angular/core';

export type BillingPlan = 'starter' | 'pro';

export interface SubscriptionResult {
  subscriptionId: string;
  shortUrl:       string;
}

@Injectable({ providedIn: 'root' })
export class BillingService {

  /**
   * Creates a Razorpay subscription via our serverless API.
   * Returns the subscription ID and a short URL the clinic owner uses to pay.
   * Razorpay auto-charges every month after first payment — no manual work needed.
   */
  async createSubscription(
    clinicId:   string,
    plan:       BillingPlan,
    clinicName: string,
    phone?:     string,
  ): Promise<SubscriptionResult> {
    const res = await fetch('/api/create-subscription', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ clinicId, plan, clinicName, phone }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as Record<string, string>)['error'] ?? 'Failed to create subscription');
    }

    return res.json() as Promise<SubscriptionResult>;
  }

  /**
   * Builds a pre-filled WhatsApp message with the payment link.
   * Super admin shares this with the clinic — clinic owner clicks, pays once,
   * Razorpay handles all future monthly charges automatically.
   */
  whatsappPaymentMessage(clinicName: string, plan: BillingPlan, paymentUrl: string): string {
    const planLabel = plan === 'pro' ? 'Pro (₹699/mo)' : 'Starter (₹399/mo)';
    const msg = `Hi ${clinicName} team!\n\nYour mydentalplatform subscription (${planLabel}) is ready.\n\nClick the link below to activate — your card will be saved and billed automatically each month:\n\n${paymentUrl}\n\nNo setup fee. Cancel anytime.`;
    return `https://wa.me/?text=${encodeURIComponent(msg)}`;
  }
}
