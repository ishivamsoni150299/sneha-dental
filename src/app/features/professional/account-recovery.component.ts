import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthFacade } from '../../core/services/auth-facade.service';

@Component({
  selector: 'app-account-recovery', standalone: true, imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="min-h-screen bg-gray-50 px-4 py-12">
      <section class="mx-auto max-w-lg space-y-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <a routerLink="/business/login" class="text-sm font-semibold text-blue-700">Back to sign in</a>
        <h1 class="text-2xl font-bold text-gray-900">Account recovery</h1>
        <p class="text-sm text-gray-600">Your password and recovery code are managed by My Dental Platform. No email or SMS service is required.</p>
        @if (auth.currentUser()) {
          <form [formGroup]="generateForm" (ngSubmit)="generate()" class="space-y-4">
            <p class="text-sm text-gray-600">Generate a replacement recovery code. Your previous code will stop working.</p>
            <label class="block text-sm font-semibold">Current password<input type="password" autocomplete="current-password" formControlName="password" class="mt-2 min-h-12 w-full rounded-xl border border-gray-300 px-3"></label>
            <button [disabled]="busy()" class="min-h-12 rounded-xl bg-blue-600 px-5 font-semibold text-white">Generate recovery code</button>
          </form>
          @if (code()) { <p class="text-sm text-gray-700">Save this privately. It is shown only once.</p><textarea readonly aria-label="Recovery code" [value]="code()" class="w-full rounded-lg border p-3 font-mono text-sm" (focus)="$any($event.target).select()"></textarea> }
        } @else {
          <form [formGroup]="form" (ngSubmit)="reset()" class="space-y-4">
            <label class="block text-sm font-semibold">Email address<input type="email" autocomplete="username" formControlName="email" class="mt-2 min-h-12 w-full rounded-xl border border-gray-300 px-3"></label>
            <label class="block text-sm font-semibold">Saved recovery code<input autocomplete="off" formControlName="code" class="mt-2 min-h-12 w-full rounded-xl border border-gray-300 px-3"></label>
            <label class="block text-sm font-semibold">New password<input type="password" autocomplete="new-password" formControlName="password" class="mt-2 min-h-12 w-full rounded-xl border border-gray-300 px-3"></label>
            <label class="block text-sm font-semibold">Confirm new password<input type="password" autocomplete="new-password" formControlName="confirm" class="mt-2 min-h-12 w-full rounded-xl border border-gray-300 px-3"></label>
            <button [disabled]="busy()" class="min-h-12 w-full rounded-xl bg-blue-600 px-5 font-semibold text-white">Reset password</button>
          </form>
          <p class="text-sm text-gray-500">Lost both your password and recovery code, or previously used an email link? Contact the platform owner to verify your identity and recover the account.</p>
        }
        @if (error()) { <p role="alert" class="text-sm text-red-700">{{ error() }}</p> }
        @if (message()) { <p role="status" class="text-sm text-green-700">{{ message() }}</p> }
      </section>
    </main>
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
