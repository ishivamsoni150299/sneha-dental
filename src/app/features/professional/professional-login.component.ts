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
    <header class="border-b border-gray-200 bg-white"><div class="mx-auto flex h-16 max-w-5xl items-center justify-between px-4"><a routerLink="/professional"><app-platform-brand /></a><a routerLink="/professional/signup" class="text-sm font-semibold text-blue-700">Create profile</a></div></header>
    <main class="auth-page px-4 py-8 sm:px-6 sm:py-14 lg:py-20">
    <div class="mx-auto grid max-w-5xl items-center gap-12 lg:grid-cols-2 lg:gap-20">
      <aside class="hidden lg:block">
        <span class="auth-icon" aria-hidden="true"><i class="ph ph-tooth"></i></span>
        <p class="mt-6 text-xs font-semibold uppercase tracking-widest text-blue-700">Your practice, connected</p>
        <h2 class="mt-4 text-5xl font-semibold leading-tight tracking-tight text-gray-900">More time for<br>the care you give.</h2>
        <p class="mt-5 max-w-sm text-base leading-7 text-gray-500">A place for your profile, appointments and video consultations. Pick up right where you left off.</p>
        <div class="mt-10 space-y-5">
          @for (item of [{icon: 'ph-calendar-check', title: 'Your day in one place', text: 'See upcoming visits and manage your availability.'}, {icon: 'ph-video-camera', title: 'Care beyond the clinic', text: 'Connect with patients through video consultations.'}]; track item.title) {
            <div class="flex gap-4"><span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-xl text-blue-600" aria-hidden="true"><i class="ph" [class]="'ph ' + item.icon"></i></span><div><h3 class="text-sm font-semibold text-gray-900">{{ item.title }}</h3><p class="mt-1 text-sm leading-6 text-gray-500">{{ item.text }}</p></div></div>
          }
        </div>
      </aside>
      <section class="auth-card mx-auto w-full max-w-md">
      <span class="auth-icon" aria-hidden="true"><i class="ph ph-user-circle"></i></span>
      <p class="mt-6 text-xs font-semibold uppercase tracking-widest text-blue-700">Dentist portal</p><h1 class="mt-2 text-3xl font-semibold tracking-tight text-gray-900">Welcome back</h1>
      <p class="mt-3 text-sm leading-6 text-gray-500">Sign in to manage your profile and patient visits.</p>
<div class="mt-6"><app-password-login portal="dentist" (authenticated)="onOtpAuthenticated($event)" /></div>
      <p class="mt-6 border-t border-gray-100 pt-5 text-center text-sm text-gray-500">New to the platform? <a routerLink="/professional/signup" class="auth-link">Create your profile</a></p>
    </section></div></main>
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
