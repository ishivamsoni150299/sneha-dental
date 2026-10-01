import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthFacade, AuthRole } from '../../../core/services/auth-facade.service';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-password-login',
  standalone: true,
  host: { class: 'block' },
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (accountCreated()) {
      <section class="space-y-4">
        <p class="ui-eyebrow">Account created</p>
        <h2 class="ui-heading ui-heading-interface">Save your recovery code</h2>
        <p class="ui-body">Keep this in your password manager. You’ll need it if you forget your password. It is shown only once.</p>
        @if (recoveryCode()) {
          <textarea readonly aria-label="Recovery code" rows="3" spellcheck="false" class="ui-field mt-2 font-mono text-sm" [value]="recoveryCode()" (focus)="$any($event.target).select()"></textarea>
          <button type="button" (click)="copyRecoveryCode()" class="ui-btn ui-btn-ghost gap-2"><i class="ph ph-copy" aria-hidden="true"></i>{{ copyMessage() || 'Copy recovery code' }}</button>
          <span class="sr-only" role="status">{{ copyMessage() }}</span>
        }
        @if (error()) { <p role="alert" class="ui-error">Your account was created. Generate a recovery code from Account recovery after signing in.</p> }
        <button type="button" (click)="continueAfterSignup()" class="ui-btn ui-btn-primary ui-btn-block">{{ recoveryCode() ? 'I saved my code — continue' : 'Continue to my account' }}<i class="ph ph-arrow-right" aria-hidden="true"></i></button>
      </section>
    } @else {
    <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-5">
      @if (signup() && portal() === 'dentist') {
        <label class="ui-label">Full name
          <input formControlName="name" autocomplete="name" maxlength="160" class="ui-field mt-2 text-base">
        </label>
      }
      <label class="ui-label">Email address
        <input formControlName="email" type="email" autocomplete="username" maxlength="254" required class="ui-field mt-2 text-base">
      </label>
      <div>
        <label for="auth-password" class="ui-label">Password</label>
        <div class="relative">
          <input id="auth-password" formControlName="password" [type]="showPassword() ? 'text' : 'password'" [autocomplete]="signup() ? 'new-password' : 'current-password'" maxlength="72" required class="ui-field ui-field-with-action mt-2 text-base">
          <button type="button" (click)="showPassword.set(!showPassword())" [attr.aria-pressed]="showPassword()" [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'" class="ui-btn ui-btn-ghost absolute bottom-0 right-0">{{ showPassword() ? 'Hide' : 'Show' }}</button>
        </div>
      </div>
      @if (signup()) {
        <p class="ui-helper">Use 8–72 characters. A longer, unique password helps protect your account.</p>
        <label class="ui-label">Confirm password
          <input formControlName="confirm" type="password" autocomplete="new-password" maxlength="72" required class="ui-field mt-2 text-base">
        </label>
      }
      @if (error()) { <p role="alert" class="ui-alert ui-alert-danger text-sm">{{ error() }}</p> }
      <button type="submit" [disabled]="busy()" [attr.aria-busy]="busy()" class="ui-btn ui-btn-primary ui-btn-block">@if (busy()) { <i class="ph ph-spinner animate-spin motion-reduce:animate-none" aria-hidden="true"></i> }{{ busy() ? 'Please wait…' : signup() ? 'Create account' : 'Sign in' }}@if (!busy()) { <i class="ph ph-arrow-right" aria-hidden="true"></i> }</button>
      @if (!signup()) { <div class="text-center"><a routerLink="/account/recovery" class="ui-btn ui-btn-ghost">Forgot your password?</a></div> }
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
  readonly showPassword = signal(false);
  readonly copyMessage = signal('');
  async copyRecoveryCode(): Promise<void> {
    try { await navigator.clipboard.writeText(this.recoveryCode()); this.copyMessage.set('Code copied'); }
    catch { this.copyMessage.set('Select the code above to copy it'); }
  }
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
        const role = await this.auth.signInWithEmail(v.email.trim(), v.password);
        this.authenticated.emit(role);
      }
    } catch (error) { this.error.set(error instanceof Error ? error.message : 'Sign-in failed. Please try again.'); }
    finally { this.busy.set(false); }
  }
}
