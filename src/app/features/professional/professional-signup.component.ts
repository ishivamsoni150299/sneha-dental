import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PlatformBrandComponent } from '../../shared/components/platform-brand/platform-brand.component';
import { PasswordLoginComponent } from '../../shared/components/password-login/password-login.component';

@Component({
  selector: 'app-professional-signup',
  standalone: true,
  imports: [RouterLink, PlatformBrandComponent, PasswordLoginComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="border-b border-gray-200 bg-white"><div class="mx-auto flex h-16 max-w-5xl items-center justify-between px-4"><a routerLink="/professional"><app-platform-brand /></a><a routerLink="/professional/login" class="text-sm font-semibold text-blue-700">Sign in</a></div></header>
    <main class="auth-page px-4 py-8 sm:py-14">
      <section class="auth-card mx-auto max-w-lg">
        <span class="auth-icon" aria-hidden="true"><i class="ph ph-tooth"></i></span>
        <p class="mt-6 text-xs font-semibold uppercase tracking-widest text-blue-700">For independent dentists</p>
        <h1 class="mt-2 text-3xl font-semibold tracking-tight text-gray-900">Make room for your practice.</h1>
        <p class="mt-3 text-sm leading-6 text-gray-500">Create your account, then add your profile and practice in one workspace. No clinic subscription required.</p>
<div class="mt-6"><app-password-login [signup]="true" portal="dentist" (authenticated)="onOtpAuthenticated()" /></div>
        <p class="mt-6 border-t border-gray-100 pt-5 text-center text-sm text-gray-500">Already have an account? <a routerLink="/professional/login" class="auth-link">Sign in</a></p>
      </section>
    </main>
  `,
})
export class ProfessionalSignupComponent {
  private readonly router = inject(Router);
  async onOtpAuthenticated(): Promise<void> { await this.router.navigateByUrl('/professional/workspace?tab=profile'); }
}
