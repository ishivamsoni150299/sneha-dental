import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { ClinicConfigService } from '../../../core/services/clinic-config.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-admin-expired',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex flex-col">

      <!-- Header -->
      <header class="border-b border-gray-100 bg-white/90 backdrop-blur sticky top-0 z-30">
        <div class="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <a routerLink="/business" class="flex items-center gap-2 group">
            <div class="w-7 h-7 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm">
              <svg class="w-[15px] h-[15px] text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2.5c-2.4 0-4.2 1.5-5.1 3.4-.5.9-.7 2-.7 3 0 1.8.8 3.1.8 4.9 0 1.3.8 4.5 2 6 .4.5.9.1 1.1-.6.3-1.8.4-3.2 1.9-3.2s1.6 1.4 1.9 3.2c.2.7.7 1.1 1.1.6 1.2-1.5 2-4.7 2-6 0-1.8.8-3.1.8-4.9 0-1-.2-2.1-.7-3C16.2 4 14.4 2.5 12 2.5z"/>
              </svg>
            </div>
            <span class="text-[15px] font-bold tracking-tight">
              <span class="text-gray-900">mydental</span><span class="text-blue-600">platform</span>
            </span>
          </a>
          <button (click)="logout()" class="text-xs text-gray-400 hover:text-gray-600 transition-colors">
            Sign out
          </button>
        </div>
      </header>

      <!-- Content -->
      <main class="flex-1 flex items-center justify-center px-4 py-16">
        <div class="max-w-lg w-full text-center">

          <!-- Icon -->
          <div class="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg class="w-10 h-10 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
            </svg>
          </div>

          <h1 class="text-2xl font-extrabold text-gray-900 mb-2">
            Your subscription has ended
          </h1>
          <p class="text-gray-500 text-sm mb-2">
            {{ clinicName }} · {{ statusLabel }}
          </p>
          <p class="text-gray-500 text-sm mb-8 max-w-sm mx-auto leading-relaxed">
            Your clinic website is currently offline. Upgrade to reactivate it instantly — all your data is safe and waiting.
          </p>

          <!-- Plans -->
          <div class="grid sm:grid-cols-2 gap-3 mb-6 text-left">
            <!-- Starter -->
            <div class="bg-white border-2 border-gray-200 rounded-2xl p-5 hover:border-blue-300 transition-colors">
              <p class="font-bold text-gray-900 mb-0.5">Starter</p>
              <p class="text-2xl font-extrabold text-blue-600 mb-1">₹999<span class="text-sm font-normal text-gray-400">/mo</span></p>
              <ul class="space-y-1.5 text-xs text-gray-600">
                <li class="flex items-center gap-1.5"><svg class="w-3 h-3 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>Professional website live instantly</li>
                <li class="flex items-center gap-1.5"><svg class="w-3 h-3 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>Online appointment booking</li>
                <li class="flex items-center gap-1.5"><svg class="w-3 h-3 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>Custom domain setup</li>
                <li class="flex items-center gap-1.5"><svg class="w-3 h-3 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>WhatsApp booking alerts</li>
              </ul>
            </div>
            <!-- Pro -->
            <div class="bg-blue-600 border-2 border-blue-600 rounded-2xl p-5 text-white relative overflow-hidden">
              <div class="absolute -top-3 left-4">
                <span class="text-[9px] font-extrabold bg-amber-400 text-amber-900 px-2.5 py-1 rounded-full uppercase tracking-wide">Most Popular</span>
              </div>
              <p class="font-bold mb-0.5 mt-1">Pro</p>
              <p class="text-2xl font-extrabold mb-1">₹1,999<span class="text-sm font-normal opacity-70">/mo</span></p>
              <ul class="space-y-1.5 text-xs opacity-90">
                <li class="flex items-center gap-1.5"><svg class="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>Everything in Starter</li>
                <li class="flex items-center gap-1.5"><svg class="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>AI receptionist 24/7</li>
                <li class="flex items-center gap-1.5"><svg class="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>SEO-optimised pages</li>
                <li class="flex items-center gap-1.5"><svg class="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>Priority support</li>
              </ul>
            </div>
          </div>

          <!-- CTA -->
          <a href="https://wa.me/919999999999?text={{ waMsg }}" target="_blank" rel="noopener"
             class="block w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl
                    text-sm transition-all hover:shadow-lg hover:-translate-y-0.5 mb-3">
            Upgrade now — reactivate instantly
          </a>
          <p class="text-xs text-gray-400">
            Questions? Email
            <a href="mailto:mydentalplatform@zohomail.in" class="text-blue-500 hover:underline">mydentalplatform&#64;zohomail.in</a>
            — we respond within 2 hours.
          </p>

        </div>
      </main>
    </div>
  `,
})
export class AdminExpiredComponent {
  private clinicCfg = inject(ClinicConfigService);
  private auth      = inject(AuthService);
  private router    = inject(Router);

  get clinicName() { return this.clinicCfg.config.name || 'Your clinic'; }

  get statusLabel(): string {
    const s = this.clinicCfg.config.subscriptionStatus;
    if (s === 'cancelled') return 'Subscription cancelled';
    if (s === 'expired')   return 'Subscription expired';
    const end = this.clinicCfg.config.trialEndDate;
    return end ? `Free trial ended ${end}` : 'Trial expired';
  }

  get waMsg(): string {
    return encodeURIComponent(
      `Hi! I'd like to upgrade my clinic "${this.clinicName}" on mydentalplatform. Please send me the payment link.`
    );
  }

  async logout() {
    await this.auth.logout();
    this.router.navigate(['/business/login']);
  }
}
