import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthFacade } from '../../core/services/auth-facade.service';
import { PlatformBrandComponent } from '../../shared/components/platform-brand/platform-brand.component';
import { OtpLoginComponent } from '../../shared/components/otp-login/otp-login.component';

@Component({
  selector: 'app-professional-signup',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PlatformBrandComponent, OtpLoginComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="border-b border-gray-200 bg-white"><div class="mx-auto flex h-16 max-w-5xl items-center justify-between px-4"><a routerLink="/professional"><app-platform-brand /></a><a routerLink="/professional/login" class="text-sm font-semibold text-blue-700">Sign in</a></div></header>
    <main class="min-h-[calc(100vh-4rem)] bg-gray-50 px-4 py-12">
      <section class="mx-auto max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <p class="text-sm font-bold uppercase tracking-wider text-blue-700">Independent dentist profile</p>
        <h1 class="mt-3 text-3xl font-bold text-gray-950">Join the dentist directory</h1>
        <p class="mt-2 text-sm leading-6 text-gray-600">No clinic website or clinic subscription is required.</p>
        @if (error()) { <p class="mt-5 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{{ error() }}</p> }
<div class="mt-6"><app-otp-login portal="dentist" (authenticated)="onOtpAuthenticated()" /></div>
      </section>
    </main>
  `,
})
export class ProfessionalSignupComponent {
  async onOtpAuthenticated(): Promise<void> { await this.router.navigateByUrl('/professional/profile'); }
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthFacade);
  private readonly router = inject(Router);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(160)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(72)]],
  });

  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.loading()) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const value = this.form.getRawValue();
      await this.auth.createProfessionalAccount(value.fullName, value.email.trim(), value.password);
      await this.router.navigateByUrl('/professional/profile');
    } catch (error) {
      this.error.set((error as Error).message || 'Could not create your profile.');
    } finally {
      this.loading.set(false);
    }
  }
}
