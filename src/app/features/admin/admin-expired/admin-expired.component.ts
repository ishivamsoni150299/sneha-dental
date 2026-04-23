import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { formatPlatformPlanPrice } from '../../../core/config/clinic.config';
import { AuthService } from '../../../core/services/auth.service';
import { BillingPlan, BillingService } from '../../../core/services/billing.service';
import { ClinicConfigService } from '../../../core/services/clinic-config.service';

@Component({
  selector: 'app-admin-expired',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex flex-col">
      <header class="sticky top-0 z-30 border-b border-gray-100 bg-white/90 backdrop-blur">
        <div class="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <a routerLink="/business" class="flex items-center gap-2 group">
            <div class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 shadow-sm">
              <svg class="h-[15px] w-[15px] text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2.5c-2.4 0-4.2 1.5-5.1 3.4-.5.9-.7 2-.7 3 0 1.8.8 3.1.8 4.9 0 1.3.8 4.5 2 6 .4.5.9.1 1.1-.6.3-1.8.4-3.2 1.9-3.2s1.6 1.4 1.9 3.2c.2.7.7 1.1 1.1.6 1.2-1.5 2-4.7 2-6 0-1.8.8-3.1.8-4.9 0-1-.2-2.1-.7-3C16.2 4 14.4 2.5 12 2.5z"/>
              </svg>
            </div>
            <span class="text-[15px] font-bold tracking-tight">
              <span class="text-gray-900">mydental</span><span class="text-blue-600">platform</span>
            </span>
          </a>
          <button (click)="logout()" class="text-xs text-gray-400 transition-colors hover:text-gray-600">
            Sign out
          </button>
        </div>
      </header>

      <main class="flex flex-1 items-center justify-center px-4 py-16">
        <div class="w-full max-w-xl text-center">
          <div class="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-amber-100">
            <svg class="h-10 w-10 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
            </svg>
          </div>

          <h1 class="mb-2 text-2xl font-extrabold text-gray-900">
            Your subscription has ended
          </h1>
          <p class="mb-2 text-sm text-gray-500">
            {{ clinicName }} · {{ statusLabel }}
          </p>
          <p class="mx-auto mb-8 max-w-sm text-sm leading-relaxed text-gray-500">
            Your clinic website is currently offline. Choose a plan below to reopen checkout instantly and bring the site back online.
          </p>

          <div class="mb-6 grid gap-3 text-left sm:grid-cols-2">
            <div class="rounded-2xl border-2 border-gray-200 bg-white p-5 transition-colors hover:border-blue-300">
              <p class="mb-0.5 font-bold text-gray-900">Starter</p>
              <p class="mb-1 text-2xl font-extrabold text-blue-600">{{ starterPrice }}</p>
              <ul class="space-y-1.5 text-xs text-gray-600">
                <li class="flex items-center gap-1.5"><svg class="h-3 w-3 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>Professional website live instantly</li>
                <li class="flex items-center gap-1.5"><svg class="h-3 w-3 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>Online appointment booking</li>
                <li class="flex items-center gap-1.5"><svg class="h-3 w-3 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>Custom domain setup</li>
                <li class="flex items-center gap-1.5"><svg class="h-3 w-3 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>WhatsApp booking alerts</li>
              </ul>
              <button
                type="button"
                (click)="reactivate('starter')"
                [disabled]="upgrading() !== null"
                class="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60">
                @if (upgrading() === 'starter') {
                  <span class="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></span>
                  Opening checkout...
                } @else {
                  Reactivate with Starter
                }
              </button>
            </div>

            <div class="relative overflow-hidden rounded-2xl border-2 border-blue-600 bg-blue-600 p-5 text-white">
              <div class="absolute -top-3 left-4">
                <span class="rounded-full bg-amber-400 px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-wide text-amber-900">Most Popular</span>
              </div>
              <p class="mb-0.5 mt-1 font-bold">Pro</p>
              <p class="mb-1 text-2xl font-extrabold">{{ proPrice }}</p>
              <ul class="space-y-1.5 text-xs opacity-90">
                <li class="flex items-center gap-1.5"><svg class="h-3 w-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>Everything in Starter</li>
                <li class="flex items-center gap-1.5"><svg class="h-3 w-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>AI receptionist 24/7</li>
                <li class="flex items-center gap-1.5"><svg class="h-3 w-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>SEO-optimised pages</li>
                <li class="flex items-center gap-1.5"><svg class="h-3 w-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>Priority support</li>
              </ul>
              <button
                type="button"
                (click)="reactivate('pro')"
                [disabled]="upgrading() !== null"
                class="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-blue-700 transition-all hover:bg-blue-50 disabled:cursor-wait disabled:opacity-60">
                @if (upgrading() === 'pro') {
                  <span class="h-4 w-4 rounded-full border-2 border-blue-200 border-t-blue-700 animate-spin"></span>
                  Opening checkout...
                } @else {
                  Reactivate with Pro
                }
              </button>
            </div>
          </div>

          @if (checkoutError()) {
            <p class="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-left text-sm text-red-700">
              {{ checkoutError() }}
            </p>
          }

          <p class="mb-3 text-xs text-gray-500">
            Secure Razorpay checkout opens in a new tab. Your website reactivates after payment confirmation.
          </p>
          <p class="text-xs text-gray-400">
            Questions? Email
            <a href="mailto:mydentalplatform@zohomail.in" class="text-blue-500 hover:underline">mydentalplatform&#64;zohomail.in</a>
            and we will help quickly.
          </p>
        </div>
      </main>
    </div>
  `,
})
export class AdminExpiredComponent {
  private readonly clinicCfg = inject(ClinicConfigService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly billing = inject(BillingService);

  readonly upgrading = signal<BillingPlan | null>(null);
  readonly checkoutError = signal<string | null>(null);

  get clinicName(): string {
    return this.clinicCfg.config.name || 'Your clinic';
  }

  get starterPrice(): string {
    return formatPlatformPlanPrice('starter', 'monthly');
  }

  get proPrice(): string {
    return formatPlatformPlanPrice('pro', 'monthly');
  }

  get statusLabel(): string {
    const status = this.clinicCfg.config.subscriptionStatus;
    if (status === 'cancelled') return 'Subscription cancelled';
    if (status === 'expired') return 'Subscription expired';

    const end = this.clinicCfg.config.trialEndDate;
    return end ? `Free trial ended ${end}` : 'Trial expired';
  }

  async reactivate(plan: BillingPlan): Promise<void> {
    if (this.upgrading()) return;

    this.upgrading.set(plan);
    this.checkoutError.set(null);

    try {
      const { paymentUrl } = await this.billing.createSubscription(
        this.clinicCfg.config.clinicId ?? '',
        plan,
        'monthly',
        this.clinicName,
        this.clinicCfg.config.phone,
      );
      window.open(paymentUrl, '_blank', 'noopener');
    } catch (error) {
      this.checkoutError.set(error instanceof Error ? error.message : 'Could not open checkout. Please try again.');
    } finally {
      this.upgrading.set(null);
    }
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    void this.router.navigate(['/business/login']);
  }
}
