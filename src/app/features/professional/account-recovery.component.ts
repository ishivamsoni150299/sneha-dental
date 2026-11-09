import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthFacade } from '../../core/services/auth-facade.service';

@Component({
  selector: 'app-account-recovery', standalone: true, imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="account-page ui-container ui-auth-layout">
      <section class="ui-card ui-auth-card">
        <a routerLink="/account" class="ui-btn ui-btn-ghost justify-self-start">Back to sign in</a>
        <div class="space-y-3"><h1 class="ui-heading ui-heading-interface">{{ workspaceUnavailable ? 'Workspace unavailable' : 'Account recovery' }}</h1>
          @if (!workspaceUnavailable) { <p class="ui-body">Get back to your account with the recovery code you saved when you signed up.</p> }</div>
        @if (workspaceUnavailable) { <p role="alert" class="ui-alert ui-alert-danger">Your clinic workspace could not be loaded. Try again, or sign out and contact support.</p> }
        @if (!auth.ready()) {
          <p role="status" class="ui-body">Checking your session…</p>
        } @else if (auth.currentUser()) {
          @if (!workspaceUnavailable) {
            <form [formGroup]="generateForm" (ngSubmit)="generate()" class="space-y-4">
              <p class="ui-body">Generate a replacement recovery code. Your previous code will stop working.</p>
              <label class="ui-label">Current password<input type="password" autocomplete="current-password" formControlName="password" [readOnly]="busy()" [attr.aria-invalid]="generateForm.controls.password.touched && generateForm.controls.password.invalid" [attr.aria-describedby]="generateForm.controls.password.touched && generateForm.controls.password.invalid ? 'current-password-error' : null" class="ui-field mt-2 text-base"></label>
              @if (generateForm.controls.password.touched && generateForm.controls.password.invalid) { <p id="current-password-error" class="ui-error">Enter your current password.</p> }
              <button [disabled]="busy()" class="ui-btn ui-btn-primary ui-btn-block">{{ busy() ? 'Generating…' : 'Generate recovery code' }}</button>
            </form>
            @if (code()) { <p class="ui-body">Save this privately. It is shown only once.</p><textarea readonly aria-label="Recovery code" [value]="code()" class="ui-field font-mono text-sm" (focus)="$any($event.target).select()"></textarea> }
          }
          <div class="ui-auth-footer flex flex-wrap gap-3">
            <a routerLink="/workspace" class="ui-btn ui-btn-secondary">{{ workspaceUnavailable ? 'Try workspace again' : 'Return to workspace' }}</a>
            <button type="button" (click)="logout()" [disabled]="busy()" class="ui-btn ui-btn-ghost">Sign out</button>
          </div>
        } @else if (message()) {
          <div role="status" class="space-y-4"><h2 class="ui-heading">Password updated</h2><p class="ui-body">{{ message() }}</p><a routerLink="/account" class="ui-btn ui-btn-primary ui-btn-block">Sign in with your new password</a></div>
        } @else {
          <form [formGroup]="form" (ngSubmit)="reset()" class="space-y-4">
            <label class="ui-label">Email address<input type="email" autocomplete="username" formControlName="email" [readOnly]="busy()" [attr.aria-invalid]="form.controls.email.touched && form.controls.email.invalid" [attr.aria-describedby]="form.controls.email.touched && form.controls.email.invalid ? 'recovery-email-error' : null" class="ui-field mt-2 text-base"></label>
            @if (form.controls.email.touched && form.controls.email.invalid) { <p id="recovery-email-error" class="ui-error">Enter a valid email address.</p> }
            <label class="ui-label">Saved recovery code<input autocomplete="off" formControlName="code" [readOnly]="busy()" [attr.aria-invalid]="form.controls.code.touched && form.controls.code.invalid" [attr.aria-describedby]="form.controls.code.touched && form.controls.code.invalid ? 'recovery-code-error' : null" class="ui-field mt-2 text-base"></label>
            @if (form.controls.code.touched && form.controls.code.invalid) { <p id="recovery-code-error" class="ui-error">Enter the recovery code you saved.</p> }
            <label class="ui-label">New password<input type="password" autocomplete="new-password" aria-describedby="recovery-password-hint" formControlName="password" [readOnly]="busy()" [attr.aria-invalid]="form.controls.password.touched && form.controls.password.invalid" class="ui-field mt-2 text-base"></label>
            <p id="recovery-password-hint" class="text-sm text-ui-ink-muted">Use 8–72 characters. Confirm the same password below.</p>
            <label class="ui-label">Confirm new password<input type="password" autocomplete="new-password" formControlName="confirm" [readOnly]="busy()" [attr.aria-invalid]="form.controls.confirm.touched && (form.controls.confirm.invalid || form.controls.confirm.value !== form.controls.password.value)" [attr.aria-describedby]="form.controls.confirm.touched && (form.controls.confirm.invalid || form.controls.confirm.value !== form.controls.password.value) ? 'recovery-confirm-error' : null" class="ui-field mt-2 text-base"></label>
            @if (form.controls.confirm.touched && (form.controls.confirm.invalid || form.controls.confirm.value !== form.controls.password.value)) { <p id="recovery-confirm-error" class="ui-error">Enter the same password in both fields.</p> }
            <button [disabled]="busy()" class="ui-btn ui-btn-primary ui-btn-block">{{ busy() ? 'Resetting…' : 'Reset password' }}</button>
          </form>
          <details><summary class="ui-btn ui-btn-ghost cursor-pointer">Lost your recovery code?</summary><p class="ui-body mt-2">If you lost your password and recovery code, or previously used an email link, contact the platform owner to verify your identity and recover your account.</p></details>
        }
        @if (error()) { <p role="alert" class="ui-alert ui-alert-danger text-sm">{{ error() }}</p> }
      </section>
    </div>
  `,
})
export class AccountRecoveryComponent {
  readonly auth = inject(AuthFacade);
  private readonly router = inject(Router);
  readonly workspaceUnavailable = inject(ActivatedRoute).snapshot.queryParamMap.get('workspace') === 'unavailable';
  private readonly fb = inject(FormBuilder);
  readonly busy = signal(false); readonly error = signal(''); readonly message = signal(''); readonly code = signal('');
  readonly generateForm = this.fb.nonNullable.group({ password: ['', Validators.required] });
  readonly form = this.fb.nonNullable.group({ email: ['', [Validators.required, Validators.email]], code: ['', Validators.required], password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(72)]], confirm: ['', Validators.required] });
  async logout(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.logout();
      await this.router.navigateByUrl('/account', { replaceUrl: true });
    } catch { this.error.set('Could not finish signing out. Try again.'); }
    finally { this.busy.set(false); }
  }
  async generate(): Promise<void> {
    if (this.busy()) return;
    this.generateForm.markAllAsTouched();
    if (this.generateForm.invalid) { this.error.set('Enter your current password to generate a recovery code.'); return; }
    this.busy.set(true); this.error.set('');
    try { this.code.set(await this.auth.generateRecoveryCode(this.generateForm.controls.password.value)); this.generateForm.reset(); }
    catch (e) { this.error.set((e as Error).message); }
    finally { this.busy.set(false); }
  }
  async reset(): Promise<void> {
    if (this.busy()) return;
    this.message.set('');
    this.form.markAllAsTouched();
    const v = this.form.getRawValue();
    if (this.form.invalid || v.password !== v.confirm) { this.error.set('Enter your email, saved code and matching passwords of 8–72 characters.'); return; }
    this.busy.set(true); this.error.set('');
    try { await this.auth.confirmPasswordReset(v.email.trim(), v.code.trim(), v.password); this.form.reset(); this.message.set('Password reset. Sign in with your new password, then save a new recovery code.'); }
    catch (e) { this.error.set((e as Error).message); }
    finally { this.busy.set(false); }
  }
}
