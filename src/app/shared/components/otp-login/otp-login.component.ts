import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthFacade, AuthRole } from '../../../core/services/auth-facade.service';

@Component({
  selector: 'app-otp-login', standalone: true, imports: [ReactiveFormsModule], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-5">
      @if (magicLinkToken()) {
        <p role="status" class="rounded-xl bg-blue-50 p-4 text-sm leading-6 text-blue-900">{{ busy() ? 'Checking your email link…' : 'Email link received. Continue to sign in' + (portal() === 'dentist' ? ' or finish creating your profile.' : '.') }}</p>
        @if (portal() === 'dentist') {
          <label class="block text-sm font-semibold text-gray-800">Professional name <span class="font-normal text-gray-500">(required for a new profile)</span><input formControlName="name" autocomplete="name" maxlength="160" class="mt-2 min-h-12 w-full rounded-xl border border-gray-300 px-4 text-base" placeholder="Dr. Sneha Sharma"></label>
        }
      } @else if (!sent()) {
        @if (portal() === 'dentist') {
          <label class="block text-sm font-semibold text-gray-800">Professional name <span class="font-normal text-gray-500">(for a new profile)</span><input formControlName="name" autocomplete="name" maxlength="160" class="mt-2 min-h-12 w-full rounded-xl border border-gray-300 px-4 text-base" placeholder="Dr. Sneha Sharma"></label>
        }
        <label class="block text-sm font-semibold text-gray-800">Email address<input formControlName="email" type="email" autocomplete="email" maxlength="254" class="mt-2 min-h-12 w-full rounded-xl border border-gray-300 px-4 text-base focus:border-blue-600 focus:ring-2 focus:ring-blue-100" placeholder="you@example.com"></label>
        <p class="text-sm leading-6 text-gray-500">We’ll email you a secure sign-in link. Use it to sign in{{ portal() === 'platform' ? '.' : ' or create your account.' }}</p>
      } @else {
        <p role="status" class="rounded-xl bg-blue-50 p-4 text-sm leading-6 text-blue-900">Open the secure sign-in link sent to <strong class="break-all">{{ destination }}</strong>. Check spam if it hasn’t arrived. If your email also shows a numeric code, you can enter it below instead.</p>
        <label class="block text-sm font-semibold text-gray-800">Verification code <span class="font-normal text-gray-500">(if shown)</span><input formControlName="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="10" class="mt-2 min-h-14 w-full rounded-xl border border-gray-300 px-4 text-center font-mono text-2xl tracking-widest" placeholder="Enter your code"></label>
      }
      @if (error()) {<p role="alert" class="rounded-xl bg-red-50 p-4 text-sm leading-6 text-red-700">{{ error() }}</p>}
      <button type="submit" [disabled]="busy()" class="min-h-12 w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{{ busy() ? 'Please wait…' : magicLinkToken() ? 'Continue' : sent() ? 'Verify and continue' : 'Email me a secure sign-in link' }}</button>
      @if (sent() && !magicLinkToken()) {
        <div class="flex flex-wrap justify-between gap-3 text-sm"><button type="button" (click)="changeEmail()" [disabled]="busy()" class="min-h-11 font-semibold text-gray-600">Change email</button><button type="button" (click)="send()" [disabled]="busy() || cooldown() > 0" class="min-h-11 font-semibold text-blue-700 disabled:text-gray-400">{{ cooldown() > 0 ? 'Resend in ' + cooldown() + 's' : 'Resend code' }}</button></div>
      }
      @if (magicLinkToken() && error()) {
        <button type="button" (click)="requestNewLink()" [disabled]="busy()" class="min-h-11 text-sm font-semibold text-blue-700">Request a new sign-in link</button>
      }
    </form>
  `,
})
export class OtpLoginComponent implements OnInit, OnDestroy {
  readonly portal = input<'clinic' | 'platform' | 'dentist'>('clinic');
  readonly authenticated = output<AuthRole>();
  private readonly auth = inject(AuthFacade);
  private readonly fb = inject(FormBuilder);
  readonly form = this.fb.nonNullable.group({ email: ['', [Validators.required, Validators.email]], name: ['', Validators.maxLength(160)], code: [''] });
  readonly sent = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly cooldown = signal(0);
  readonly magicLinkToken = signal('');
  destination = '';
  private timer?: ReturnType<typeof setInterval>;
  ngOnInit(): void {
    if (typeof location === 'undefined' || !location.hash) return;
    const parameters = new URLSearchParams(location.hash.slice(1));
    if (parameters.has('error') || parameters.has('error_code')) {
      history.replaceState(history.state, '', location.pathname + location.search);
      this.error.set('This email link has expired or has already been used. Enter your email to request a new link.');
      return;
    }
    const token = parameters.get('access_token') ?? '';
    if (!token) return;
    this.magicLinkToken.set(token);
    history.replaceState(history.state, '', location.pathname + location.search);
    if (this.portal() !== 'dentist') void this.exchangeMagicLink();
  }
  requestNewLink(): void { this.magicLinkToken.set(''); this.changeEmail(); }
  async submit(): Promise<void> {
    if (this.magicLinkToken()) { await this.exchangeMagicLink(); return; }
    if (!this.sent()) { await this.send(); return; }
    if (this.busy()) return;
    const code = this.form.controls.code.value.trim();
    if (!/^\d{6,10}$/.test(code)) { this.error.set('Enter the full code from your email.'); return; }
    this.busy.set(true); this.error.set('');
    try { this.authenticated.emit(await this.auth.verifyOtp(this.destination, this.portal(), code, this.form.controls.name.value.trim())); }
    catch (error) { this.error.set(error instanceof Error ? error.message : 'Could not verify your code.'); }
    finally { this.busy.set(false); }
  }
  private async exchangeMagicLink(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true); this.error.set('');
    try {
      this.authenticated.emit(await this.auth.exchangeMagicLink(
        this.magicLinkToken(), this.portal(), this.form.controls.name.value.trim()));
    } catch (error) { this.error.set(error instanceof Error ? error.message : 'This sign-in link is invalid or expired.'); }
    finally { this.busy.set(false); }
  }
  async send(): Promise<void> {
    if (this.busy() || (this.sent() && this.cooldown() > 0)) return;
    if (this.form.controls.email.invalid) { this.error.set('Enter a valid email address.'); return; }
    this.busy.set(true); this.error.set('');
    try {
      this.destination = this.form.controls.email.value.trim().toLowerCase();
      await this.auth.requestOtp(this.destination, this.portal());
      this.sent.set(true); this.form.controls.code.setValue(''); this.cooldown.set(60);
      clearInterval(this.timer); this.timer = setInterval(() => { this.cooldown.update(n => Math.max(0, n - 1)); if (!this.cooldown()) clearInterval(this.timer); }, 1000);
    } catch (error) { this.error.set(error instanceof Error ? error.message : 'Could not send a code.'); }
    finally { this.busy.set(false); }
  }
  changeEmail(): void { this.sent.set(false); this.form.controls.code.setValue(''); this.error.set(''); }
  ngOnDestroy(): void { clearInterval(this.timer); }
}
