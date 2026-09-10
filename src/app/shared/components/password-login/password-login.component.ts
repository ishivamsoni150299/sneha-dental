import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthFacade, AuthRole } from '../../../core/services/auth-facade.service';

@Component({
  selector: 'app-password-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-5">
      @if (signup() && portal() === 'dentist') {
        <label class="block text-sm font-semibold text-gray-900">Full name
          <input formControlName="name" autocomplete="name" maxlength="160" class="mt-2 min-h-12 w-full rounded-xl border border-gray-300 px-4">
        </label>
      }
      <label class="block text-sm font-semibold text-gray-900">Email address
        <input formControlName="email" type="email" autocomplete="username" maxlength="254" required class="mt-2 min-h-12 w-full rounded-xl border border-gray-300 px-4">
      </label>
      <label class="block text-sm font-semibold text-gray-900">Password
        <input formControlName="password" type="password" [autocomplete]="signup() ? 'new-password' : 'current-password'" maxlength="72" required class="mt-2 min-h-12 w-full rounded-xl border border-gray-300 px-4">
      </label>
      @if (signup()) {
        <p class="text-sm text-gray-500">Use at least 8 characters. You can sign in immediately with your email and password.</p>
        <label class="block text-sm font-semibold text-gray-900">Confirm password
          <input formControlName="confirm" type="password" autocomplete="new-password" maxlength="72" required class="mt-2 min-h-12 w-full rounded-xl border border-gray-300 px-4">
        </label>
      }
      @if (error()) { <p role="alert" class="rounded-xl bg-red-50 p-3 text-sm text-red-700">{{ error() }}</p> }
      <button type="submit" [disabled]="busy()" class="min-h-12 w-full rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{{ busy() ? 'Please wait…' : signup() ? 'Create account' : 'Sign in' }}</button>
      @if (!signup()) { <p class="text-sm text-gray-500">Previously used an email link, or forgot your password? Contact the platform owner to set up or recover your password.</p> }
    </form>
  `,
})
export class PasswordLoginComponent {
  readonly portal = input<'clinic' | 'dentist' | 'platform'>('clinic');
  readonly signup = input(false);
  readonly authenticated = output<AuthRole>();
  readonly busy = signal(false);
  readonly error = signal('');
  private readonly auth = inject(AuthFacade);
  readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required], confirm: [''], name: [''],
  });
  async submit(): Promise<void> {
    if (this.busy()) return;
    const v = this.form.getRawValue();
    if (this.form.invalid) { this.error.set('Enter your email and password.'); return; }
    if (this.signup() && (v.password.length < 8 || v.password.length > 72)) { this.error.set('Use a password between 8 and 72 characters.'); return; }
    if (this.signup() && v.password !== v.confirm) { this.error.set('Passwords do not match.'); return; }
    if (this.signup() && this.portal() === 'dentist' && v.name.trim().length < 2) { this.error.set('Enter your full name.'); return; }
    this.busy.set(true); this.error.set('');
    try {
      await this.auth.authReady;
      if (this.signup()) {
        if (this.portal() === 'platform') throw new Error('Platform accounts are created by the operator.');
        if (this.portal() === 'dentist') await this.auth.createProfessionalAccount(v.name.trim(), v.email.trim(), v.password);
        else await this.auth.createAccountWithEmail(v.email.trim(), v.password);
        this.authenticated.emit(this.auth.role()!);
      } else {
        const role = this.portal() === 'dentist'
          ? await this.auth.signInProfessional(v.email.trim(), v.password)
          : await this.auth.signInWithEmail(v.email.trim(), v.password);
        if (this.portal() === 'platform' && role !== 'platform-admin') {
          await this.auth.logout();
          throw new Error('This account does not have platform access.');
        }
        this.authenticated.emit(role);
      }
    } catch (error) { this.error.set(error instanceof Error ? error.message : 'Sign-in failed. Please try again.'); }
    finally { this.busy.set(false); }
  }
}
