import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AnalyticsService } from '../../core/services/analytics.service';

@Component({
  selector: 'app-request-dentist', standalone: true, imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="ui-card mx-auto mt-6 max-w-xl p-5 text-left sm:p-6" aria-labelledby="request-dentist-title">
      <h2 id="request-dentist-title" class="text-xl font-semibold">Request a dentist</h2>
      @if (sent()) {
        <p role="status" class="ui-alert ui-alert-success mt-4">Your request has been saved. Our team can contact you about suitable care. This is not an appointment or a guarantee of availability.</p>
      } @else {
        <p class="ui-body mt-2">Tell us what you need. Your preferred time is a request, not an available appointment.</p>
        <form [formGroup]="form" (ngSubmit)="submit()" class="mt-5 space-y-4">
          <label class="ui-label">Location<input class="ui-field mt-2" formControlName="location" maxlength="160" autocomplete="address-level2" required></label>
          <label class="ui-label">Treatment or problem<textarea class="ui-field mt-2" formControlName="problem" maxlength="500" required></textarea></label>
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="ui-label">Preferred date<input class="ui-field mt-2" type="date" formControlName="preferredDate" [min]="today" required></label>
            <label class="ui-label">Preferred time (India)<input class="ui-field mt-2" type="time" formControlName="preferredTime" required></label>
          </div>
          <label class="ui-label">Your name<input class="ui-field mt-2" formControlName="name" autocomplete="name" maxlength="160" required></label>
          <label class="ui-label">Mobile number<input class="ui-field mt-2" type="tel" formControlName="mobile" autocomplete="tel-national" inputmode="tel" placeholder="10-digit Indian mobile" required></label>
          <label class="ui-label">Email (optional)<input class="ui-field mt-2" type="email" formControlName="email" autocomplete="email" maxlength="254"></label>
          <label class="flex items-start gap-3 text-sm"><input type="checkbox" formControlName="consent" class="mt-1" required><span>I agree to be contacted about this request and have read the <a class="ui-link" routerLink="/business/privacy">privacy notice</a>.</span></label>
          @if (error()) { <p role="alert" class="ui-alert ui-alert-danger">{{ error() }}</p> }
          <button class="ui-btn ui-btn-primary ui-btn-block" [disabled]="busy()">{{ busy() ? 'Sending request…' : 'Send dentist request' }}</button>
        </form>
      }
    </section>
  `,
})
export class RequestDentistComponent {
  readonly location = input(''); readonly problem = input('');
  readonly busy = signal(false); readonly sent = signal(false); readonly error = signal('');
  readonly today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  private readonly analytics = inject(AnalyticsService);
  readonly form = inject(FormBuilder).nonNullable.group({
    location: ['', [Validators.required, Validators.maxLength(160)]], problem: ['', [Validators.required, Validators.maxLength(500)]],
    preferredDate: ['', Validators.required], preferredTime: ['', Validators.required], name: ['', Validators.required],
    mobile: ['', [Validators.required, Validators.pattern(/^(?:\+91)?[6-9]\d{9}$/)]], email: ['', Validators.email], consent: [false, Validators.requiredTrue],
  });
  constructor() { effect(() => { this.form.patchValue({ location: this.location(), problem: this.problem() }); }); }
  async submit(): Promise<void> {
    if (this.busy()) return;
    this.error.set(''); this.form.markAllAsTouched();
    if (this.form.invalid) { this.error.set('Complete the required fields, enter a valid mobile number, and agree to be contacted.'); return; }
    this.busy.set(true);
    try {
      const value = this.form.getRawValue();
      const response = await fetch('/api/public/dentist-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...value, mobile: value.mobile.startsWith('+91') ? value.mobile : `+91${value.mobile}` }), signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(response.status === 429 ? 'Too many requests. Please try again later.' : 'Your request could not be saved. Check your details and try again.');
      this.sent.set(true); this.form.reset(); this.analytics.trackEvent('request_dentist_submitted');
    } catch (e) { this.error.set(e instanceof Error ? e.message : 'Could not send your request. Please try again.'); }
    finally { this.busy.set(false); }
  }
}
