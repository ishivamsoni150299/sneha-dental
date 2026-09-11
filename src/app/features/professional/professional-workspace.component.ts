import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthenticatedApiService } from '../../core/services/authenticated-api.service';

interface Visit {
  id: string; booking_ref: string; patient_name: string; phone_e164: string;
  service: string; date: string; time: string; status: string; source: string; location_name: string;
  consultation_mode?: 'in_person' | 'video';
}
interface Day { enabled: boolean; start: string; end: string; breaks: { start: string; end: string }[] }
interface Practice { id: string; name: string; city: string; status: string; schedule: string | Record<string, unknown> }

@Component({
  selector: 'app-professional-workspace', standalone: true, imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-gray-50 pb-10">
      <header class="sticky top-0 z-20 border-b border-gray-200 bg-white">
        <div class="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <a routerLink="/professional/profile" class="inline-flex min-h-11 items-center text-sm font-semibold text-blue-700">← My profile</a>
          <span class="text-sm font-bold text-gray-900">Dentist workspace</span>
        </div>
      </header>
      <main class="mx-auto max-w-6xl px-4 py-6 sm:py-10">
        <h1 class="text-3xl font-bold text-gray-900">Your practice, at a glance</h1>
        <p class="mt-2 text-sm text-gray-500">Manage assigned appointments and your hours at each practice. Times are in India Standard Time.</p>
        <nav class="mt-6 flex gap-2 rounded-2xl border border-gray-200 bg-white p-1" aria-label="Workspace">
          <button (click)="tab.set('appointments')" [attr.aria-pressed]="tab() === 'appointments'" [class.bg-blue-100]="tab() === 'appointments'" class="min-h-12 flex-1 rounded-xl px-3 font-semibold text-blue-700">Appointments</button>
          <button (click)="tab.set('availability')" [attr.aria-pressed]="tab() === 'availability'" [class.bg-blue-100]="tab() === 'availability'" class="min-h-12 flex-1 rounded-xl px-3 font-semibold text-blue-700">Availability</button>
        </nav>
        @if (error()) { <p role="alert" class="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">{{ error() }}</p> }
        @if (message()) { <p role="status" class="mt-4 rounded-xl bg-blue-100 p-4 text-sm text-blue-900">{{ message() }}</p> }
        @if (tab() === 'appointments') {
          <div class="my-5 flex flex-wrap items-center justify-between gap-3">
            <label class="text-sm font-semibold">Show
              <select [ngModel]="view()" (ngModelChange)="changeView($event)" [disabled]="busy() || loading()" class="ml-2 min-h-11 rounded-xl border border-gray-300 bg-white px-3 text-base">
                <option value="upcoming">Upcoming visits</option><option value="pending">Needs confirmation</option><option value="history">Past visits</option>
              </select>
            </label>
            <button (click)="loadVisits()" [disabled]="busy() || loading()" class="min-h-11 px-3 text-sm font-semibold text-blue-700">Refresh</button>
          </div>
          @if (loading()) { <p role="status" class="py-8 text-gray-500">Loading appointments…</p> }
          @else {
            @for (visit of visits(); track visit.id) {
              <article class="mb-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div class="flex flex-wrap items-center gap-2">
                    <h2 class="text-lg font-bold text-gray-900">{{ visit.patient_name }}</h2>
                    @if (visit.consultation_mode === 'video' || visit.service.toLowerCase().includes('video')) {
                      <span class="rounded-lg bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-800">Video consultation</span>
                    } @else {
                      <span class="rounded-lg bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">In-clinic</span>
                    }
                  </div>
                  <span class="rounded-lg bg-blue-100 px-3 py-1 text-sm text-blue-700">{{ visit.status.replace('_', ' ') }}</span>
                </div>
                <p class="mt-2 font-semibold text-gray-900">{{ visit.date }} · {{ visit.time }}</p>
                <p class="mt-1 text-sm text-gray-500">{{ visit.location_name }} · {{ visit.service }} · {{ visit.booking_ref }}</p>
                <a [href]="'tel:' + visit.phone_e164" class="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-blue-700">Call {{ visit.phone_e164 }}</a>
                @if (visit.status === 'pending') {
                  <div class="mt-3 flex flex-wrap gap-2">
                    <button (click)="updateVisit(visit, 'confirmed')" [disabled]="busy()" class="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white">Confirm</button>
                    <button (click)="openDecline(visit)" [disabled]="busy()" class="min-h-11 rounded-xl border border-gray-300 px-4 text-sm font-semibold">{{ visit.source === 'marketplace' ? 'Decline' : 'Cancel' }}</button>
                  </div>
                }
                @if (visit.status === 'confirmed') {
                  <div class="mt-3 flex flex-wrap gap-2">
                    <button (click)="updateVisit(visit, 'checked_in')" [disabled]="busy()" class="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white">Mark checked in</button>
                    @if (visit.consultation_mode === 'video' || visit.service.toLowerCase().includes('video')) {
                      <button (click)="joinVideo(visit)" [disabled]="busy()" class="min-h-11 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700">Join video call</button>
                    }
                  </div>
                }
                @if (visit.status === 'checked_in') {
                  <div class="mt-3 flex flex-wrap gap-2">
                    <button (click)="updateVisit(visit, 'completed')" [disabled]="busy()" class="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white">Complete visit</button>
                    @if (visit.consultation_mode === 'video' || visit.service.toLowerCase().includes('video')) {
                      <button (click)="joinVideo(visit)" [disabled]="busy()" class="min-h-11 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700">Join video call</button>
                    }
                  </div>
                }
                @if (declining()?.id === visit.id) {
                  <label class="mt-4 block text-sm font-semibold" [for]="'reason-' + visit.id">Reason for patient</label>
                  <textarea [id]="'reason-' + visit.id" [(ngModel)]="reason" maxlength="500" class="mt-2 w-full rounded-xl border border-gray-300 p-3 text-base" rows="2"></textarea>
                  <button (click)="updateVisit(visit, visit.source === 'marketplace' ? 'declined' : 'cancelled', reason)" [disabled]="busy() || !reason.trim()" class="mt-2 min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-50">Save decision</button>
                  <button (click)="declining.set(null)" [disabled]="busy()" class="min-h-11 px-4 text-sm">Keep appointment</button>
                }
              </article>
            } @empty { <div class="rounded-2xl border border-gray-200 bg-white p-8 text-center"><h2 class="font-bold text-gray-900">No appointments in this view</h2><p class="mt-2 text-sm text-gray-500">Clinic bookings assigned to your dentist profile appear here.</p></div> }
            @if (visits().length === 200) { <p class="text-sm text-gray-500">Showing the first 200 appointments in this view.</p> }
          }
        } @else {
          <section class="mt-5 rounded-2xl border border-gray-200 bg-white p-4 sm:p-6">
            <h2 class="text-xl font-bold text-gray-900">Practice hours</h2>
            <p class="mt-2 text-sm text-gray-500">30-minute appointments. Schedule changes cannot remove a time with an upcoming booking.</p>
            @if (profileLoading()) { <p class="mt-6" role="status">Loading locations…</p> }
            @else if (!practices().length) { <p class="mt-6 text-gray-500">Add an active practice location in <a routerLink="/professional/profile" class="text-blue-700 underline">your profile</a> first.</p> }
            @else {
              <label class="mt-5 block text-sm font-semibold">Practice location
                <select [ngModel]="selectedId" (ngModelChange)="selectLocation($event)" [disabled]="saving()" class="mt-2 min-h-12 w-full rounded-xl border border-gray-300 px-3 text-base">
                  @for (practice of practices(); track practice.id) { <option [value]="practice.id">{{ practice.name }} · {{ practice.city }}</option> }
                </select>
              </label>
              <form (ngSubmit)="saveSchedule()">
                <fieldset [disabled]="saving()" class="mt-4">
                  @for (day of days; track day.key; let i = $index) {
                    <div class="border-b border-gray-200 py-4">
                      <label class="flex min-h-11 items-center gap-3 font-semibold"><input type="checkbox" [(ngModel)]="hours[i].enabled" [name]="day.key + '-enabled'" class="h-5 w-5 accent-blue-600">{{ day.label }}</label>
                      @if (hours[i].enabled) {
                        <div class="mt-2 grid grid-cols-2 gap-3">
                          <label class="text-sm text-gray-600">Opens<input type="time" required [(ngModel)]="hours[i].start" [name]="day.key + '-start'" class="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-gray-300 px-2 text-base"></label>
                          <label class="text-sm text-gray-600">Closes<input type="time" required [(ngModel)]="hours[i].end" [name]="day.key + '-end'" class="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-gray-300 px-2 text-base"></label>
                        </div>
                        @for (pause of hours[i].breaks; track $index; let j = $index) {
                          <div class="mt-3 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                            <label class="text-xs text-gray-500">Break starts<input type="time" required [(ngModel)]="pause.start" [name]="day.key + '-break-start-' + j" class="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-gray-300 px-2 text-base"></label>
                            <label class="text-xs text-gray-500">Break ends<input type="time" required [(ngModel)]="pause.end" [name]="day.key + '-break-end-' + j" class="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-gray-300 px-2 text-base"></label>
                            <button type="button" (click)="hours[i].breaks.splice(j, 1)" class="min-h-11 px-2 text-blue-700" aria-label="Remove break">×</button>
                          </div>
                        }
                        <button type="button" (click)="hours[i].breaks.push({start:'13:00', end:'14:00'})" [disabled]="hours[i].breaks.length >= 10" class="mt-2 min-h-11 text-sm font-semibold text-blue-700">+ Add break</button>
                      }
                    </div>
                  }
                  <label class="mt-5 block text-sm font-semibold">Days off (one date per line, YYYY-MM-DD)
                    <textarea [(ngModel)]="daysOff" name="daysOff" rows="3" placeholder="2026-12-25" class="mt-2 w-full rounded-xl border border-gray-300 p-3 text-base"></textarea>
                  </label>
                  <button class="mt-4 min-h-12 w-full rounded-xl bg-blue-600 px-6 font-semibold text-white hover:bg-blue-700 disabled:opacity-50" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save availability' }}</button>
                </fieldset>
              </form>
            }
          </section>
        }
      </main>
    </div>
  `,
})
export class ProfessionalWorkspaceComponent implements OnInit {
  private readonly api = inject(AuthenticatedApiService);
  readonly tab = signal<'appointments' | 'availability'>('appointments');
  readonly view = signal('upcoming');
  readonly visits = signal<Visit[]>([]);
  readonly practices = signal<Practice[]>([]);
  readonly loading = signal(false);
  readonly profileLoading = signal(false);
  readonly saving = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly message = signal<string | null>(null);
  readonly declining = signal<Visit | null>(null);
  readonly days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((label, i) => ({ label, key: ['mon','tue','wed','thu','fri','sat','sun'][i] }));
  selectedId = '';
  hours: Day[] = [];
  daysOff = '';
  reason = '';

  async ngOnInit(): Promise<void> { await Promise.all([this.loadVisits(), this.loadPractices()]); }
  private async request<T>(url: string, body?: object): Promise<T> {
    const response = await this.api.fetch(url, body ? { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
    const data = await response.json().catch(() => ({})) as { message?: string; detail?: string };
    if (!response.ok) throw new Error(data.detail || data.message || 'Could not complete this action. Please retry.');
    return data as T;
  }
  async loadVisits(): Promise<void> {
    this.loading.set(true); this.error.set(null);
    try { this.visits.set(await this.request<Visit[]>(`/api/providers/me/appointments?view=${this.view()}`)); }
    catch (e) { this.error.set((e as Error).message); }
    finally { this.loading.set(false); }
  }
  async loadPractices(): Promise<void> {
    this.profileLoading.set(true);
    try {
      const profile = await this.request<{ locations: Practice[] }>('/api/providers/me');
      this.practices.set(profile.locations.filter(p => p.status === 'active'));
      if (this.practices().length) this.selectLocation(this.practices()[0].id);
    } catch (e) { this.error.set((e as Error).message); }
    finally { this.profileLoading.set(false); }
  }
  changeView(view: string): void { this.view.set(view); this.declining.set(null); void this.loadVisits(); }
  openDecline(visit: Visit): void { this.reason = ''; this.declining.set(visit); }
  async updateVisit(visit: Visit, status: string, reason?: string): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(null); this.message.set(null);
    try {
      await this.request(`/api/providers/me/appointments/${visit.id}/status`, { status, cancellationReason: reason?.trim() });
      this.declining.set(null); await this.loadVisits(); this.message.set('Appointment updated.');
    } catch (e) { this.error.set((e as Error).message); }
    finally { this.busy.set(false); }
  }
  selectLocation(id: string): void {
    this.selectedId = id;
    const raw = this.practices().find(p => p.id === id)?.schedule ?? {};
    const schedule = typeof raw === 'string' ? JSON.parse(raw) as Record<string, unknown> : raw;
    this.hours = this.days.map(day => {
      const saved = schedule[day.key] as Partial<Day> | undefined;
      return { enabled: saved?.enabled ?? false, start: saved?.start ?? '09:00', end: saved?.end ?? '17:00', breaks: structuredClone(saved?.breaks ?? []) };
    });
    this.daysOff = ((schedule['daysOff'] ?? []) as string[]).join('\n');
    this.message.set(null);
  }
  async saveSchedule(): Promise<void> {
    if (this.saving() || !this.selectedId) return;
    const schedule: Record<string, unknown> = Object.fromEntries(this.days.map((day, i) => [day.key, { ...this.hours[i], breaks: [...this.hours[i].breaks].sort((a,b) => a.start.localeCompare(b.start)) }]));
    schedule['daysOff'] = [...new Set(this.daysOff.split(/\s+/).filter(Boolean))];
    this.saving.set(true); this.error.set(null); this.message.set(null);
    try {
      await this.request(`/api/providers/me/locations/${this.selectedId}/schedule`, { schedule });
      this.practices.update(items => items.map(p => p.id === this.selectedId ? { ...p, schedule } : p));
      this.message.set('Availability saved. Existing appointments are unchanged.');
    } catch (e) { this.error.set((e as Error).message); }
    finally { this.saving.set(false); }
  }
  async joinVideo(visit: Visit): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(null);
    try {
      const response = await this.api.fetch(`/api/providers/me/appointments/${visit.id}/video/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json() as { roomUrl?: string; token?: string; message?: string; detail?: string };
      if (!response.ok) throw new Error(data.detail || data.message || 'Could not join video consultation.');
      if (data.roomUrl) {
        const fullUrl = data.token ? `${data.roomUrl}?t=${encodeURIComponent(data.token)}` : data.roomUrl;
        window.open(fullUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
