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
    <div class="ui-shell">
      <header class="ui-topbar">
        <div class="ui-container flex min-h-16 items-center justify-between gap-4 py-2">
          <a routerLink="/professional" aria-label="mydentalplatform dentist home"><app-platform-brand /></a>
          <a routerLink="/professional/login" class="ui-btn ui-btn-secondary">Sign in</a>
        </div>
      </header>
      <main class="ui-auth-layout">
        <section class="ui-card ui-auth-card">
          <div class="space-y-3">
            <p class="ui-eyebrow">For independent dentists</p>
            <h1 class="ui-heading ui-heading-interface">Make room for your practice.</h1>
            <p class="ui-body">Create your account, then add your profile and practice in one workspace. No clinic subscription required.</p>
          </div>
          <app-password-login [signup]="true" portal="dentist" (authenticated)="onOtpAuthenticated()" />
          <p class="ui-auth-footer">Already have an account? <a routerLink="/professional/login" class="ui-btn ui-btn-ghost">Sign in</a></p>
        </section>
      </main>
    </div>
  `,
})
export class ProfessionalSignupComponent {
  private readonly router = inject(Router);
  async onOtpAuthenticated(): Promise<void> { await this.router.navigateByUrl('/professional/workspace?tab=profile'); }
}
