import { ChangeDetectionStrategy, Component, OnInit, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthenticatedApiService } from '../../core/services/authenticated-api.service';
import { AuthFacade } from '../../core/services/auth-facade.service';
import { VideoConsultationComponent } from '../../shared/components/video-consultation/video-consultation.component';
import { ProfessionalProfileComponent } from './professional-profile.component';
import { AnalyticsService } from '../../core/services/analytics.service';

interface Visit {
  id: string; booking_ref: string; patient_name: string; phone_e164: string;
  service: string; date: string; time: string; status: string; source: string; location_name: string;
  consultation_mode?: 'in_person' | 'video';
}
interface Day { enabled: boolean; start: string; end: string; breaks: { start: string; end: string }[] }
interface Practice { id: string; name: string; city: string; status: string; schedule: string | Record<string, unknown> }

@Component({
  selector: 'app-professional-workspace', standalone: true, imports: [FormsModule, RouterLink, VideoConsultationComponent, ProfessionalProfileComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-ui-muted pb-10">
      <header class="ui-topbar">
        <div class="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2">
          <span class="text-sm font-bold text-ui-ink">Dentist workspace</span>
          <div class="flex items-center gap-3"><a routerLink="/account/recovery" class="ui-btn ui-btn-ghost">Account recovery</a><button (click)="logout()" class="ui-btn ui-btn-ghost">Sign out</button></div>
        </div>
      </header>
      <main class="mx-auto max-w-6xl px-4 py-6 sm:py-10">
        <h1 class="ui-heading ui-heading-interface">Manage your practice</h1>
        <p class="mt-2 text-sm text-ui-ink-muted">One place for your profile, hours and patient visits. Times are in India Standard Time.</p>
        @if (verificationStatus() && verificationStatus() !== 'verified') {
          <section class="mt-5 ui-card p-5" aria-labelledby="dentist-setup-title">
            <h2 id="dentist-setup-title" class="font-semibold">{{ verificationStatus() === 'pending' ? 'Your profile is under review' : 'Get ready for patient bookings' }}</h2>
            @if (verificationStatus() === 'pending') {
              <p class="ui-body mt-2">Your details have been submitted. You can review your profile and hours while the team checks your registration.</p>
            } @else {
              <ol class="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                <li>1. Profile and practice <span class="block text-ui-ink-muted">{{ practices().length ? 'Practice added · review your details' : 'Add your details and practice' }}</span></li>
                <li>2. Appointment hours <span class="block text-ui-ink-muted">{{ hasBookableHours() ? 'Hours saved' : 'Choose when patients can book' }}</span></li>
                <li>3. Verification <span class="block text-ui-ink-muted">{{ verificationStatus() === 'rejected' ? 'Update the details flagged in your profile' : 'Submit your council registration for review' }}</span></li>
              </ol>
              <button (click)="selectTab(practices().length && !hasBookableHours() ? 'availability' : 'profile')" [disabled]="saving() || profileEditor()?.saving() || profileEditor()?.savingLocation()" class="ui-btn ui-btn-primary mt-4">{{ practices().length && !hasBookableHours() ? 'Set appointment hours' : hasBookableHours() ? 'Review and submit profile' : 'Complete your profile' }}</button>
            }
          </section>
        }
        <nav class="mt-6 flex flex-wrap gap-2" aria-label="Workspace">
          <button (click)="selectTab('appointments')" [disabled]="saving() || profileEditor()?.saving() || profileEditor()?.savingLocation()" [attr.aria-pressed]="tab() === 'appointments'" [class.ui-tab-active]="tab() === 'appointments'" class="ui-btn ui-btn-secondary flex-1">Appointments</button>
          <button (click)="selectTab('availability')" [disabled]="saving() || profileEditor()?.saving() || profileEditor()?.savingLocation()" [attr.aria-pressed]="tab() === 'availability'" [class.ui-tab-active]="tab() === 'availability'" class="ui-btn ui-btn-secondary flex-1">Hours</button>
          <button (click)="selectTab('profile')" [disabled]="saving() || profileEditor()?.saving() || profileEditor()?.savingLocation()" [attr.aria-pressed]="tab() === 'profile'" [class.ui-tab-active]="tab() === 'profile'" class="ui-btn ui-btn-secondary flex-1">Profile</button>
        </nav>
        @if (error()) { <p role="alert" class="mt-4 ui-alert ui-alert-danger">{{ error() }}</p> }
        @if (message()) { <p role="status" class="mt-4 ui-alert">{{ message() }}</p> }
        @if (tab() === 'profile') {
          <app-professional-profile [embedded]="true" [hasHours]="hasBookableHours()" (locationAdded)="onLocationAdded()" (profileChanged)="loadPractices()" />
        } @else if (tab() === 'appointments') {
          <a routerLink="/professional/video-test" class="ui-btn ui-btn-secondary mt-5">Test video call</a>
          <div class="my-5 flex flex-wrap items-center justify-between gap-3">
            <label class="text-sm font-semibold">Show
              <select [ngModel]="view()" (ngModelChange)="changeView($event)" [disabled]="busy() || loading()" class="ui-field mt-1 text-base">
                <option value="upcoming">Upcoming visits</option><option value="pending">Needs confirmation</option><option value="history">Past visits</option>
              </select>
            </label>
            <button (click)="loadVisits()" [disabled]="busy() || loading()" class="ui-btn ui-btn-ghost">Refresh</button>
          </div>
          @if (loading()) { <p role="status" class="py-8 text-ui-ink-muted">Loading appointments…</p> }
          @else {
            @for (visit of visits(); track visit.id) {
              <article class="mb-4 ui-card p-5">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div class="flex flex-wrap items-center gap-2">
                    <h2 class="text-lg font-bold text-ui-ink">{{ visit.patient_name }}</h2>
                    @if (visit.consultation_mode === 'video' || visit.service.toLowerCase().includes('video')) {
                      <span class="rounded-lg bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-800">Video consultation</span>
                    } @else {
                      <span class="rounded-lg bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">In-clinic</span>
                    }
                  </div>
                  <span class="rounded-lg bg-blue-100 px-3 py-1 text-sm text-blue-700">{{ visit.status.replace('_', ' ') }}</span>
                </div>
                <p class="mt-2 font-semibold text-ui-ink">{{ visit.date }} · {{ visit.time }}</p>
                <p class="mt-1 text-sm text-ui-ink-muted">{{ visit.location_name }} · {{ visit.service }} · {{ visit.booking_ref }}</p>
                <a [href]="'tel:' + visit.phone_e164" class="ui-btn ui-btn-ghost mt-2">Call {{ visit.phone_e164 }}</a>
                @if (visit.status === 'pending') {
                  <div class="mt-3 flex flex-wrap gap-2">
                    <button (click)="updateVisit(visit, 'confirmed')" [disabled]="busy()" class="ui-btn ui-btn-primary">Confirm</button>
                    <button (click)="openDecline(visit)" [disabled]="busy()" class="ui-btn ui-btn-secondary">{{ visit.source === 'marketplace' ? 'Decline' : 'Cancel' }}</button>
                  </div>
                }
                @if (visit.status === 'confirmed') {
                  <div class="mt-3 flex flex-wrap gap-2">
                    <button (click)="updateVisit(visit, 'checked_in')" [disabled]="busy()" class="ui-btn ui-btn-primary">Mark checked in</button>
                    @if (visit.consultation_mode === 'video' || visit.service.toLowerCase().includes('video')) {
                      <app-video-consultation [appointmentId]="visit.id" [staff]="true" [dentist]="true" />
                    }
                  </div>
                }
                @if (visit.status === 'checked_in') {
                  <div class="mt-3 flex flex-wrap gap-2">
                    <button (click)="updateVisit(visit, 'completed')" [disabled]="busy()" class="ui-btn ui-btn-primary">Complete visit</button>
                    @if (visit.consultation_mode === 'video' || visit.service.toLowerCase().includes('video')) {
                      <app-video-consultation [appointmentId]="visit.id" [staff]="true" [dentist]="true" />
                    }
                  </div>
                }
                @if (declining()?.id === visit.id) {
                  <label class="mt-4 block text-sm font-semibold" [for]="'reason-' + visit.id">Reason for patient</label>
                  <textarea [id]="'reason-' + visit.id" [(ngModel)]="reason" maxlength="500" class="ui-field mt-2 text-base" rows="2"></textarea>
                  <button (click)="updateVisit(visit, visit.source === 'marketplace' ? 'declined' : 'cancelled', reason)" [disabled]="busy() || !reason.trim()" class="ui-btn ui-btn-primary mt-2">{{ visit.source === 'marketplace' ? 'Decline request' : 'Cancel appointment' }}</button>
                  <button (click)="declining.set(null)" [disabled]="busy()" class="ui-btn ui-btn-ghost">Keep appointment</button>
                }
              </article>
            } @empty { <div class="ui-card p-8 text-center"><h2 class="font-bold text-ui-ink">No appointments in this view</h2><p class="mt-2 text-sm text-ui-ink-muted">Clinic bookings assigned to your dentist profile appear here.</p></div> }
            @if (visits().length === 200) { <p class="text-sm text-ui-ink-muted">Showing the first 200 appointments in this view.</p> }
          }
        } @else {
          <section class="mt-5 ui-card p-4 sm:p-6">
            <h2 class="text-xl font-bold text-ui-ink">Practice hours</h2>
            <p class="mt-2 text-sm text-ui-ink-muted">30-minute appointments. Schedule changes cannot remove a time with an upcoming booking.</p>
            @if (profileLoading()) { <p class="mt-6" role="status">Loading locations…</p> }
            @else if (!practices().length) { <p class="mt-6 text-ui-ink-muted">Add a practice in the <button (click)="selectTab('profile')" class="ui-btn ui-btn-ghost">Profile tab</button> first.</p> }
            @else {
              <label class="mt-5 block text-sm font-semibold">Practice location
                <select [ngModel]="selectedId" (ngModelChange)="selectLocation($event)" [disabled]="saving()" class="ui-field mt-2 text-base">
                  @for (practice of practices(); track practice.id) { <option [value]="practice.id">{{ practice.name }} · {{ practice.city }}</option> }
                </select>
              </label>
              <form (ngSubmit)="saveSchedule()">
                <fieldset [disabled]="saving()" class="mt-4">
                  @for (day of days; track day.key; let i = $index) {
                    <div class="border-b border-ui-line py-4">
                      <label class="flex min-h-11 items-center gap-3 font-semibold"><input type="checkbox" [(ngModel)]="hours[i].enabled" [name]="day.key + '-enabled'" class="h-5 w-5 accent-blue-600">{{ day.label }}</label>
                      @if (hours[i].enabled) {
                        <div class="mt-2 grid grid-cols-2 gap-3">
                          <label class="text-sm text-ui-ink-muted">Opens<input type="time" required [(ngModel)]="hours[i].start" [name]="day.key + '-start'" class="ui-field mt-1 min-w-0 text-base"></label>
                          <label class="text-sm text-ui-ink-muted">Closes<input type="time" required [(ngModel)]="hours[i].end" [name]="day.key + '-end'" class="ui-field mt-1 min-w-0 text-base"></label>
                        </div>
                        @for (pause of hours[i].breaks; track $index; let j = $index) {
                          <div class="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2">
                            <label class="text-xs text-ui-ink-muted">Break starts<input type="time" required [(ngModel)]="pause.start" [name]="day.key + '-break-start-' + j" class="ui-field mt-1 min-w-0 text-base"></label>
                            <label class="text-xs text-ui-ink-muted">Break ends<input type="time" required [(ngModel)]="pause.end" [name]="day.key + '-break-end-' + j" class="ui-field mt-1 min-w-0 text-base"></label>
                            <button type="button" (click)="hours[i].breaks.splice(j, 1)" class="ui-btn ui-btn-ghost" aria-label="Remove break">×</button>
                          </div>
                        }
                        <button type="button" (click)="hours[i].breaks.push({start:'13:00', end:'14:00'})" [disabled]="hours[i].breaks.length >= 10" class="ui-btn ui-btn-ghost mt-2">+ Add break</button>
                      }
                    </div>
                  }
                  <label class="mt-5 block text-sm font-semibold">Days off (one date per line, YYYY-MM-DD)
                    <textarea [(ngModel)]="daysOff" name="daysOff" rows="3" placeholder="2026-12-25" class="ui-field mt-2 text-base"></textarea>
                  </label>
                  <button class="ui-btn ui-btn-primary mt-4 w-full" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save availability' }}</button>
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
  readonly profileEditor = viewChild(ProfessionalProfileComponent);
  private readonly analytics = inject(AnalyticsService);
  private readonly api = inject(AuthenticatedApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthFacade);
  readonly tab = signal<'profile' | 'appointments' | 'availability'>('profile');
  readonly verificationStatus = signal('');
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
  hasBookableHours(): boolean {
    return this.practices().some(practice => {
      const schedule = typeof practice.schedule === 'string' ? JSON.parse(practice.schedule) as Record<string, unknown> : practice.schedule;
      return this.days.some(day => (schedule[day.key] as Partial<Day> | undefined)?.enabled);
    });
  }

  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadVisits(), this.loadPractices()]);
    const requested = this.route.snapshot.queryParamMap.get('tab');
    if (requested === 'profile' || requested === 'appointments' || requested === 'availability') this.tab.set(requested);
    else this.tab.set(this.verificationStatus() === 'verified' ? 'appointments' : 'profile');
  }
  selectTab(tab: 'profile' | 'appointments' | 'availability'): void {
    if (this.saving() || this.profileEditor()?.saving() || this.profileEditor()?.savingLocation()) return;
    this.tab.set(tab);
    void this.router.navigate([], { relativeTo: this.route, queryParams: { tab }, queryParamsHandling: 'merge', replaceUrl: true });
  }
  async onLocationAdded(): Promise<void> { await this.loadPractices(); this.selectTab('availability'); this.message.set('Practice added. Set your weekly hours next.'); }
  async logout(): Promise<void> { await this.auth.logout(); location.assign('/professional'); }
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
      const profile = await this.request<{ locations: Practice[]; verificationStatus: string }>('/api/providers/me');
      this.verificationStatus.set(profile.verificationStatus);
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
      if (status === 'confirmed') this.analytics.trackEvent('booking_confirmed', { consultation_mode: visit.consultation_mode });
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
      if (this.verificationStatus() !== 'verified') {
        this.saving.set(false);
        this.selectTab('profile');
        this.message.set('Hours saved. Review your profile and submit for verification when ready.');
      }
    } catch (e) { this.error.set((e as Error).message); }
    finally { this.saving.set(false); }
  }
}
