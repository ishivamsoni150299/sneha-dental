import { ChangeDetectionStrategy, Component, input, output, signal, inject, OnInit } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { BillingService, SubscriptionStatus } from '../../../core/services/billing.service';
import { ClinicConfigService } from '../../../core/services/clinic-config.service';

@Component({
  selector: 'app-billing-status',
  standalone: true,
  imports: [CurrencyPipe, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="ui-card p-5 space-y-3 text-left" aria-label="Payment status">
      <h3 class="text-base font-bold text-ui-ink">Payment status</h3>
      @if (loading()) { <p role="status" class="ui-helper">Checking your subscription…</p> }
      @if (error()) { <p role="alert" class="ui-error">{{ error() }}</p> }
      @if (status(); as current) {
        <p role="status" class="text-sm text-ui-ink-soft">
          @if (current.status === 'active') { Your paid plan is active. }
          @else if (current.plan === 'trial') { Your Free plan is active. }
          @else { Payment or renewal is awaiting confirmation. Paid features activate after verification. }
        </p>
        @if (current.currentPeriodEnd) {
          <p class="ui-helper">Current period ends {{ current.currentPeriodEnd | date:'mediumDate':'+0530' }}.</p>
        }
        @if (current.providerStatus === 'creating') {
          <p class="ui-helper">Checkout creation is awaiting confirmation. Contact billing support before making another payment.</p>
        }
      }
      @if ((checkoutUrl() || status()?.paymentUrl) && status()?.status !== 'active') {
        <a class="ui-btn ui-btn-primary" [href]="checkoutUrl() || status()?.paymentUrl" target="_blank" rel="noopener">Continue to secure payment</a>
        <p class="ui-helper">After payment, return here and check payment status. Manual payments require billing support to verify your reference.</p>
      }
      <button type="button" class="ui-btn ui-btn-secondary" (click)="refresh()" [disabled]="loading()">{{ loading() ? 'Checking…' : 'Check payment status' }}</button>
      @if (status()?.payments?.length) {
        <h4 class="text-sm font-bold text-ui-ink">Recorded payments</h4>
        <ul class="space-y-3">
          @for (payment of status()!.payments!; track payment.reference) {
            <li class="flex flex-wrap justify-between gap-2 border-t border-ui-line pt-3 text-sm">
              <span>{{ payment.paidAt | date:'mediumDate' }} · {{ payment.amount | currency:'INR' }}</span>
              <span class="break-all text-ui-ink-muted">{{ payment.reference }}</span>
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class BillingStatusComponent implements OnInit {
  private readonly billing = inject(BillingService);
  private readonly clinic = inject(ClinicConfigService);
  readonly checkoutUrl = input<string | null>(null);
  readonly statusChange = output<SubscriptionStatus>();
  readonly status = signal<SubscriptionStatus | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  ngOnInit(): void { void this.load(false); }
  refresh(): void { void this.load(true); }
  private async load(refresh: boolean): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const status = await (refresh ? this.billing.refreshSubscription() : this.billing.currentSubscription());
      this.status.set(status);
      if (status.plan && status.status) this.clinic.updateConfig({
        subscriptionPlan: status.plan,
        subscriptionStatus: status.status as 'trial' | 'pending' | 'active' | 'expired' | 'cancelled',
        subscriptionEndDate: status.currentPeriodEnd ?? undefined,
      });
      this.statusChange.emit(status);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not check payment status.');
    } finally { this.loading.set(false); }
  }
}
