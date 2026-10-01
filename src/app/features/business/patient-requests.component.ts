import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { AuthFacade } from '../../core/services/auth-facade.service';

interface PatientRequest { id: string; location: string; problem: string; preferred_date: string; preferred_time: string; patient_name: string; mobile: string; email: string | null; status: string; }
@Component({
  selector: 'app-patient-requests', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section class="ui-page"><h1 class="ui-heading">Patient dentist requests</h1><p class="ui-body mt-3">Latest 200 requests. Contact the patient before arranging care; these are not confirmed appointments.</p>
    @if (error()) { <p role="alert" class="ui-alert ui-alert-danger mt-4">{{ error() }}</p><button class="ui-btn ui-btn-secondary" (click)="load()">Try again</button> }
    @if (loading()) { <p role="status" class="ui-body mt-4">Loading requests…</p> }
    @for (request of requests(); track request.id) {
      <article class="ui-card mt-4 space-y-3 p-5"><h2 class="text-lg font-semibold">{{ request.patient_name }} · {{ request.location }}</h2><p>{{ request.problem }}</p>
      <p>Preferred: {{ request.preferred_date }} {{ request.preferred_time }} (India)</p><p class="break-words">{{ request.mobile }} · {{ request.email || 'No email supplied' }}</p>
      <label class="ui-label">Status<select class="ui-field mt-2" [value]="request.status" [disabled]="saving() === request.id" (change)="update(request, $event)"><option value="new">New</option><option value="contacted">Contacted</option><option value="closed">Closed</option></select></label></article>
    } @empty { @if (!loading() && !error()) { <p class="ui-body mt-6">No dentist requests yet.</p> } }
  </section>`,
})
export class PatientRequestsComponent implements OnInit {
  private readonly auth = inject(AuthFacade);
  readonly requests = signal<PatientRequest[]>([]); readonly loading = signal(true); readonly error = signal(''); readonly saving = signal('');
  async ngOnInit(): Promise<void> { await this.load(); }
  async load(): Promise<void> {
    this.loading.set(true); this.error.set('');
    try { const response = await fetch('/api/admin/dentist-requests', { headers: { Authorization: `Bearer ${await this.auth.getFreshIdToken()}` } });
      if (!response.ok) throw new Error('Could not load patient requests.'); this.requests.set(await response.json());
    } catch (e) { this.error.set((e as Error).message); } finally { this.loading.set(false); }
  }
  async update(request: PatientRequest, event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement; this.saving.set(request.id); this.error.set('');
    try { const response = await fetch(`/api/admin/dentist-requests/${request.id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${await this.auth.getFreshIdToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: select.value }) });
      if (!response.ok) throw new Error('Status was not saved. Try again.'); request.status = select.value;
    } catch (e) { select.value = request.status; this.error.set((e as Error).message); } finally { this.saving.set(''); }
  }
}
