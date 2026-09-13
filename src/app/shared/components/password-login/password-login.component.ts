import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthFacade, AuthRole } from '../../../core/services/auth-facade.service';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-password-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (accountCreated()) {
      <section class="space-y-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
        <h2 class="font-bold text-gray-900">Save your recovery code</h2>
        <p class="text-sm text-gray-700">Keep this privately in your password manager. It lets you reset your password without email or SMS. It is shown only once.</p>
        @if (recoveryCode()) { <textarea readonly aria-label="Recovery code" class="w-full rounded-lg border border-gray-300 p-3 font-mono text-sm" [value]="recoveryCode()" (focus)="$any($event.target).select()"></textarea> }
        @if (error()) { <p role="alert" class="text-sm text-red-700">Your account was created. Generate a recovery code from Account recovery after signing in.</p> }
        <button type="button" (click)="continueAfterSignup()" class="min-h-12 w-full rounded-xl bg-blue-600 px-4 font-semibold text-white">{{ recoveryCode() ? 'I saved my code — continue' : 'Continue to my account' }}</button>
      </section>
    } @else {
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
      @if (!signup()) { <a routerLink="/account/recovery" class="block text-sm font-semibold text-blue-700">Forgot password? Use your recovery code</a> }
    </form>
    }
  `,
})
export class PasswordLoginComponent {
  readonly portal = input<'clinic' | 'dentist' | 'platform' | 'patient'>('clinic');
  readonly signup = input(false);
  readonly authenticated = output<AuthRole>();
  readonly busy = signal(false);
  readonly error = signal('');
  readonly recoveryCode = signal('');
  readonly accountCreated = signal(false);
  continueAfterSignup(): void { this.authenticated.emit(this.auth.role()!); }
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
        if (this.portal() === 'patient') await this.auth.createPatientAccount(v.email.trim(), v.password);
        else if (this.portal() === 'dentist') await this.auth.createProfessionalAccount(v.name.trim(), v.email.trim(), v.password);
        else await this.auth.createAccountWithEmail(v.email.trim(), v.password);
        this.accountCreated.set(true);
        this.recoveryCode.set(await this.auth.generateRecoveryCode(v.password));
      } else {
        const role = this.portal() === 'dentist'
          ? await this.auth.signInProfessional(v.email.trim(), v.password)
          : await this.auth.signInWithEmail(v.email.trim(), v.password);
        this.authenticated.emit(role);
      }
    } catch (error) { this.error.set(error instanceof Error ? error.message : 'Sign-in failed. Please try again.'); }
    finally { this.busy.set(false); }
  }
}
