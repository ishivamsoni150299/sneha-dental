import { ChangeDetectionStrategy, Component, OnInit, effect, inject, input, signal } from '@angular/core';
import { AnalyticsService } from '../../core/services/analytics.service';

@Component({
  selector: 'app-booking-otp', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!loaded()) { <p role="status" class="ui-body">Checking mobile verification…</p> }
    @if (required()) {
      <section class="ui-card my-4 space-y-3 p-4" aria-labelledby="booking-otp-title">
        <h3 id="booking-otp-title" class="font-semibold">Verify your mobile number</h3>
        <p class="ui-body">We’ll send a code to the mobile number you entered. Verification does not confirm the appointment.</p>
        @if (proof()) { <p role="status" class="text-sm text-emerald-800">Mobile verified. Submit your request within 10 minutes.</p> }
        @else {
          <button type="button" class="ui-btn ui-btn-secondary" [disabled]="busy() || !available()" (click)="send()">{{ sent() ? 'Resend code' : 'Send verification code' }}</button>
          @if (sent()) {
            <label class="ui-label">Verification code<input class="ui-field mt-2" autocomplete="one-time-code" inputmode="numeric" maxlength="10" [value]="code()" (input)="code.set($any($event.target).value)"></label>
            <button type="button" class="ui-btn ui-btn-primary" [disabled]="busy()" (click)="verify()">Verify mobile</button>
          }
        }
        @if (!available() && loaded()) { <p role="alert" class="ui-alert ui-alert-danger">Mobile verification is temporarily unavailable. Please try again later.</p> }
      </section>
    }
    @if (error()) { <p role="alert" class="ui-alert ui-alert-danger my-3">{{ error() }}</p> }
  `,
})
export class BookingOtpComponent implements OnInit {
  readonly phone = input(''); readonly loaded = signal(false); readonly required = signal(true); readonly available = signal(false);
  readonly busy = signal(false); readonly sent = signal(false); readonly error = signal(''); readonly proof = signal(''); readonly code = signal('');
  private expiresAt = 0;
  private readonly analytics = inject(AnalyticsService);
  constructor() { effect(() => { this.phone(); this.proof.set(''); this.sent.set(false); this.code.set(''); }); }
  async ngOnInit(): Promise<void> {
    try { const response = await fetch('/api/public/booking-verification', { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('Verification settings could not be loaded. Refresh the page to try again.');
      const status = await response.json(); this.required.set(status.required === true); this.available.set(status.available === true); this.loaded.set(true);
    } catch (e) { this.error.set((e as Error).message); }
  }
  canSubmit(): boolean {
    const valid = this.loaded() && (!this.required() || (!!this.proof() && Date.now() < this.expiresAt));
    if (!valid) { this.proof.set(''); this.error.set('Verify your current mobile number before submitting. If verification is unavailable, try again later.'); }
    return valid;
  }
  async send(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(''); const phone = this.phone();
    try { await this.request('request', { phone }); if (phone === this.phone()) { this.sent.set(true); this.proof.set(''); this.analytics.trackEvent('otp_requested'); } }
    catch (e) { this.error.set((e as Error).message); } finally { this.busy.set(false); }
  }
  async verify(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(''); const phone = this.phone();
    try { const result = await this.request('verify', { phone, code: this.code() });
      if (phone === this.phone()) { this.proof.set(result.proof); this.expiresAt = Date.now() + 600000; this.code.set(''); }
    } catch (e) { this.error.set((e as Error).message); } finally { this.busy.set(false); }
  }
  private async request(action: string, body: object): Promise<{ proof: string }> {
    const response = await fetch(`/api/public/booking-verification/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.detail || result.message || 'Verification failed. Please try again.'); return result;
  }
}
