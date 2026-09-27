import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthFacade } from '../../core/services/auth-facade.service';

@Component({
  selector: 'app-account-recovery', standalone: true, imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ui-shell"><main class="ui-auth-layout">
      <section class="ui-card ui-auth-card">
        <a routerLink="/business/login" class="ui-btn ui-btn-ghost justify-self-start">Back to sign in</a>
        <div class="space-y-3"><h1 class="ui-heading ui-heading-interface">Account recovery</h1>
          <p class="ui-body">Get back to your account with the recovery code you saved when you signed up.</p></div>
        @if (auth.currentUser()) {
          <form [formGroup]="generateForm" (ngSubmit)="generate()" class="space-y-4">
            <p class="ui-body">Generate a replacement recovery code. Your previous code will stop working.</p>
            <label class="ui-label">Current password<input type="password" autocomplete="current-password" formControlName="password" class="ui-field mt-2 text-base"></label>
            <button [disabled]="busy()" class="ui-btn ui-btn-primary ui-btn-block">Generate recovery code</button>
          </form>
          @if (code()) { <p class="ui-body">Save this privately. It is shown only once.</p><textarea readonly aria-label="Recovery code" [value]="code()" class="ui-field font-mono text-sm" (focus)="$any($event.target).select()"></textarea> }
        } @else {
          <form [formGroup]="form" (ngSubmit)="reset()" class="space-y-4">
            <label class="ui-label">Email address<input type="email" autocomplete="username" formControlName="email" class="ui-field mt-2 text-base"></label>
            <label class="ui-label">Saved recovery code<input autocomplete="off" formControlName="code" class="ui-field mt-2 text-base"></label>
            <label class="ui-label">New password<input type="password" autocomplete="new-password" formControlName="password" class="ui-field mt-2 text-base"></label>
            <label class="ui-label">Confirm new password<input type="password" autocomplete="new-password" formControlName="confirm" class="ui-field mt-2 text-base"></label>
            <button [disabled]="busy()" class="ui-btn ui-btn-primary ui-btn-block">Reset password</button>
          </form>
          <p class="ui-body">Lost both your password and recovery code, or previously used an email link? Contact the platform owner to verify your identity and recover the account.</p>
        }
        @if (error()) { <p role="alert" class="ui-alert ui-alert-danger text-sm">{{ error() }}</p> }
        @if (message()) { <p role="status" class="ui-alert ui-alert-success text-sm">{{ message() }}</p> }
      </section>
    </main></div>
  `,
})
export class AccountRecoveryComponent {
  readonly auth = inject(AuthFacade);
  private readonly fb = inject(FormBuilder);
  readonly busy = signal(false); readonly error = signal(''); readonly message = signal(''); readonly code = signal('');
  readonly generateForm = this.fb.nonNullable.group({ password: ['', Validators.required] });
  readonly form = this.fb.nonNullable.group({ email: ['', [Validators.required, Validators.email]], code: ['', Validators.required], password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(72)]], confirm: ['', Validators.required] });
  async generate(): Promise<void> {
    if (this.generateForm.invalid || this.busy()) return;
    this.busy.set(true); this.error.set('');
    try { this.code.set(await this.auth.generateRecoveryCode(this.generateForm.controls.password.value)); this.generateForm.reset(); }
    catch (e) { this.error.set((e as Error).message); }
    finally { this.busy.set(false); }
  }
  async reset(): Promise<void> {
    if (this.busy()) return;
    const v = this.form.getRawValue();
    if (this.form.invalid || v.password !== v.confirm) { this.error.set('Enter your email, saved code and matching passwords of 8–72 characters.'); return; }
    this.busy.set(true); this.error.set('');
    try { await this.auth.confirmPasswordReset(v.email.trim(), v.code.trim(), v.password); this.form.reset(); this.message.set('Password reset. Sign in with your new password, then save a new recovery code.'); }
    catch (e) { this.error.set((e as Error).message); }
    finally { this.busy.set(false); }
  }
}
