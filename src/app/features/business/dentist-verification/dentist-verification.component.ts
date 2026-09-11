import { ChangeDetectionStrategy, Component, inject, signal, type OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AuthenticatedApiService } from '../../../core/services/authenticated-api.service';

interface Submission {
  id: string; full_name: string; email: string | null; phone_e164: string | null;
  qualification: string | null; speciality: string | null; experience_years: number | null;
  registration_number: string | null; registration_council: string | null;
  biography: string | null; locations: string | null; updated_at: string;
}

@Component({
  selector: 'app-dentist-verification', standalone: true, imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div><h1 class="text-2xl font-bold text-gray-900">Dentist Verification</h1>
      <p class="mt-2 text-gray-500">Review registration details before approving a public dentist listing.</p></div>
      <button class="ui-btn ui-btn-secondary" (click)="load()" [disabled]="loading() || busy() !== null">Refresh</button>
    </div>
    @if (error()) { <p role="alert" class="mt-4 rounded-xl bg-red-50 p-4 text-red-800">{{ error() }}</p> }
    @if (message()) { <p role="status" class="mt-4 rounded-xl bg-blue-100 p-4 text-blue-900">{{ message() }}</p> }
    @if (loading()) { <p class="mt-6 text-gray-500" role="status">Loading submissions…</p> }
    @else {
      @for (dentist of submissions(); track dentist.id) {
        <article class="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 class="text-xl font-bold text-gray-900">{{ dentist.full_name }}</h2>
          <p class="mt-1 text-sm text-gray-500">Last updated {{ dentist.updated_at | date:'medium' }}</p>
          <dl class="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <div><dt class="text-gray-500">Contact</dt><dd>{{ dentist.email || 'No email' }} · {{ dentist.phone_e164 || 'No phone' }}</dd></div>
            <div><dt class="text-gray-500">Qualifications and speciality</dt><dd>{{ dentist.qualification }} · {{ dentist.speciality }} · {{ dentist.experience_years ?? 0 }} years</dd></div>
            <div><dt class="text-gray-500">Registration</dt><dd>{{ dentist.registration_number }} · {{ dentist.registration_council }}</dd></div>
            <div><dt class="text-gray-500">Active practice locations</dt><dd>{{ dentist.locations || 'No active location' }}</dd></div>
          </dl>
          @if (dentist.biography) { <p class="mt-4 whitespace-pre-line text-sm text-gray-700">{{ dentist.biography }}</p> }
          <label class="mt-5 block text-sm font-semibold" [for]="'reason-' + dentist.id">Reason (required to reject)</label>
          <textarea #reason [id]="'reason-' + dentist.id" maxlength="1000" rows="2" class="mt-2 w-full rounded-xl border border-gray-300 p-3" [disabled]="busy() !== null"></textarea>
          <div class="mt-4 flex flex-wrap gap-3">
            <button class="ui-btn ui-btn-primary" [disabled]="busy() !== null" (click)="review(dentist, 'verify', '')">Approve and publish</button>
            <button class="ui-btn ui-btn-secondary" [disabled]="busy() !== null" (click)="review(dentist, 'reject', reason.value)">Reject</button>
          </div>
        </article>
      } @empty { @if (!error()) { <p class="mt-6 text-gray-500">No dentists awaiting verification.</p> } }
    }
  `,
})
export class DentistVerificationComponent implements OnInit {
  private readonly api = inject(AuthenticatedApiService);
  readonly submissions = signal<Submission[]>([]);
  readonly loading = signal(false);
  readonly busy = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly message = signal<string | null>(null);

  ngOnInit(): void { void this.load(); }

  async load(): Promise<void> {
    this.loading.set(true); this.error.set(null);
    try {
      const response = await this.api.fetch('/api/admin/providers/pending');
      if (!response.ok) throw new Error('Could not load submissions. Please retry.');
      this.submissions.set(await response.json() as Submission[]);
    } catch (error) { this.error.set((error as Error).message); }
    finally { this.loading.set(false); }
  }

  async review(dentist: Submission, action: 'verify' | 'reject', reason: string): Promise<void> {
    if (this.busy()) return;
    this.error.set(null); this.message.set(null);
    if (action === 'reject' && !reason.trim()) { this.error.set('Enter a rejection reason first.'); return; }
    this.busy.set(dentist.id);
    try {
      const response = await this.api.fetch(`/api/admin/providers/${encodeURIComponent(dentist.id)}/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!response.ok) throw new Error(response.status === 409
        ? 'Submission changed or required details are missing. Refresh and review again.' : 'Could not save the decision. Please retry.');
      this.submissions.update(items => items.filter(item => item.id !== dentist.id));
      this.message.set(`${dentist.full_name}: ${action === 'verify' ? 'approved and published' : 'rejected'}.`);
    } catch (error) { this.error.set((error as Error).message); }
    finally { this.busy.set(null); }
  }
}
