import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthRole } from '../../core/services/auth-facade.service';
import { PlatformBrandComponent } from '../../shared/components/platform-brand/platform-brand.component';
import { PasswordLoginComponent } from '../../shared/components/password-login/password-login.component';

@Component({
  selector: 'app-professional-login', standalone: true,
  imports: [RouterLink, PlatformBrandComponent, PasswordLoginComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ui-shell">
      <header class="ui-topbar">
        <div class="ui-container flex min-h-16 items-center justify-between gap-4 py-2">
          <a routerLink="/professional" aria-label="mydentalplatform dentist home"><app-platform-brand /></a>
          <a routerLink="/professional/signup" class="ui-btn ui-btn-secondary">Create profile</a>
        </div>
      </header>
      <main class="ui-auth-layout ui-auth-layout-split">
        <aside class="hidden lg:block">
          <p class="ui-eyebrow">Your practice, connected</p>
          <h2 class="ui-heading ui-heading-interface">More time for the care you give.</h2>
          <p class="ui-body mt-5 max-w-sm">A place for your profile, appointments and video consultations. Pick up right where you left off.</p>
          <div class="mt-10 space-y-5">
            @for (item of [{icon: 'ph-calendar-check', title: 'Your day in one place', text: 'See upcoming visits and manage your availability.'}, {icon: 'ph-video-camera', title: 'Care beyond the clinic', text: 'Connect with patients through video consultations.'}]; track item.title) {
              <div class="flex gap-4">
                <i class="ph text-xl text-ui-primary" [class]="'ph ' + item.icon" aria-hidden="true"></i>
                <div><h3 class="ui-title">{{ item.title }}</h3><p class="ui-body mt-1">{{ item.text }}</p></div>
              </div>
            }
          </div>
        </aside>
        <section class="ui-card ui-auth-card">
          <div class="space-y-3">
            <p class="ui-eyebrow">Dentist portal</p>
            <h1 class="ui-heading ui-heading-interface">Welcome back</h1>
            <p class="ui-body">Sign in to manage your profile and patient visits.</p>
          </div>
          <app-password-login portal="dentist" (authenticated)="onOtpAuthenticated($event)" />
          <p class="ui-auth-footer">New to the platform? <a routerLink="/professional/signup" class="ui-btn ui-btn-ghost">Create your profile</a></p>
        </section>
      </main>
    </div>
  `,
})
export class ProfessionalLoginComponent {
  private readonly route = inject(ActivatedRoute);
  async onOtpAuthenticated(role: AuthRole): Promise<void> {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    const destination = role === 'dentist'
      ? (returnUrl?.startsWith('/professional/') && !returnUrl.includes('\\') ? returnUrl : '/professional/workspace')
      : role === 'platform-admin' ? '/business/clinics'
        : role === 'clinic-admin' ? '/business/clinic/dashboard' : '/business/signup';
    await this.router.navigateByUrl(destination);
  }
  private readonly router = inject(Router);
}
