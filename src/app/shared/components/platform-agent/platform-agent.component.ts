import { Component, DestroyRef, ElementRef, HostListener, NgZone, PLATFORM_ID, ViewChild, computed, effect, inject, input, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { roleWorkspace } from '../../../core/utils/account-navigation';
import { AuthFacade } from '../../../core/services/auth-facade.service';
import { AuthenticatedApiService } from '../../../core/services/authenticated-api.service';
import { LiveConnection } from './live-connection';
import { PlatformHeaderComponent } from '../platform-header/platform-header.component';
import { PlatformNavigationComponent } from '../platform-navigation/platform-navigation.component';
import { MiliBookingComponent, type BookingCriteria } from './mili-booking.component';

interface AgentResult {
  status: 'needs_input' | 'navigate' | 'needs_confirmation' | 'succeeded' | 'booking';
  booking?: BookingCriteria;
  message: string;
  path?: string;
  draftId?: string;
  draft?: { name: string; phone: string; city: string; slug: string; plan: string };
  refreshSession?: boolean;
}
interface Message { role: 'user' | 'assistant'; text: string }
interface TaskShortcut { title: string; detail: string; action?: string; path?: string; prompt?: string }
const DESTINATIONS = new Set(['/mili', '/dentists', '/appointments', '/workspace', '/account', '/business/signup', '/business/signup?resume=true', '/business/clinic/settings', '/business/clinic/dashboard', '/professional/workspace', '/business/clinics']);

@Component({
  selector: 'app-platform-agent', standalone: true, imports: [FormsModule, RouterLink, MiliBookingComponent, PlatformHeaderComponent, PlatformNavigationComponent],
  templateUrl: './platform-agent.component.html', styleUrl: './platform-agent.component.css',
})
export class PlatformAgentComponent {
  readonly mainPage = input(false);
  readonly auth = inject(AuthFacade);
  private readonly api = inject(AuthenticatedApiService);
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  @ViewChild('launcher') launcher?: ElementRef<HTMLAnchorElement>;
  @ViewChild('command') command?: ElementRef<HTMLInputElement>;
  @ViewChild('taskCanvas') taskCanvas?: ElementRef<HTMLElement>;
  @ViewChild('editName') editName?: ElementRef<HTMLInputElement>;
  @ViewChild(MiliBookingComponent) bookingCard?: MiliBookingComponent;
  readonly directWorkspace = computed(() => roleWorkspace(this.auth.role()));
  readonly taskTitle = signal('What would you like to do?');
  readonly shortcuts = computed<TaskShortcut[]>(() => {
    const common = [{ title: 'Find a dentist', detail: 'Choose a dentist and request a time', action: 'booking' },
      { title: 'My appointments', detail: 'Open your appointments', path: '/appointments' }];
    const role = this.auth.role();
    if (role === 'incomplete-signup') return [{ title: 'Set up my clinic', detail: this.available() ? 'Prepare a clinic for your review' : 'Continue your clinic setup', ...(this.available() ? { prompt: 'Help me set up my clinic' } : { path: '/business/signup?resume=true' }) }, common[0]];
    if (role === 'clinic-admin') return [{ title: 'Clinic workspace', detail: 'Appointments and daily work', path: '/business/clinic/dashboard' },
      { title: 'Clinic settings', detail: 'Manage your clinic details', path: '/business/clinic/settings' }];
    if (role === 'dentist' || role === 'platform-admin') return [{ title: 'My workspace', detail: 'Open your professional workspace', path: roleWorkspace(role) }, common[0]];
    return common;
  });
  readonly available = signal(false);
  readonly checked = signal(false);
  readonly busy = signal(false);
  readonly voice = signal<'off' | 'connecting' | 'listening' | 'speaking'>('off');
  readonly muted = signal(false);
  readonly messages = signal<Message[]>([]);
  readonly result = signal<AgentResult | null>(null);
  readonly error = signal('');
  readonly caption = signal('');
  readonly state = computed(() => this.busy() ? 'working' : this.voice() !== 'off' ? this.voice() : this.error() ? 'attention'
    : this.bookingSent() || this.result()?.status === 'succeeded' ? 'complete' : this.result()?.draftId ? 'review' : 'idle');
  readonly taskStatus = computed(() => this.busy() ? 'Working' : this.error() ? 'Needs attention' : this.result()?.draftId ? 'Review before creating' : this.result()?.status === 'succeeded' ? 'Completed' : this.result()?.status === 'navigate' ? 'Page opened' : this.result()?.status === 'needs_input' ? 'Your input needed' : 'Ready when you are');
  readonly editing = signal(false);
  readonly bookingSent = signal(false);
  readonly hasTask = computed(() => !!this.result() || this.busy() || !!this.error() || this.messages().length > 0);
  readonly latestReply = computed(() => this.messages().filter(message => message.role === 'assistant').at(-1)?.text ?? '');
  commandPlaceholder(): string {
    if (this.bookingSent()) return 'Ask about your next step…';
    if (this.result()?.booking) return this.bookingCard?.selected() ? 'Try “change the time”' : 'Try “make it Friday evening”';
    return this.result()?.draft ? 'Tell me what to change…' : 'Ask Mili to find care or help with your clinic…';
  }
  editDraft = { name: '', phone: '', city: '', slug: '' };
  input = '';
  private connection?: LiveConnection;
  private userSpeech = '';
  private generation = 0;
  private abort?: AbortController;
  private accountId: string | null | undefined;
  private voiceTask: Promise<string> = Promise.resolve('');
  private captionSource: 'user' | 'assistant' | null = null;
  private captionText = '';

  constructor() {
    effect(() => { if (!this.mainPage()) this.stopVoice(); });
    effect(() => {
      const id = this.auth.currentUser()?.uid ?? null;
      if (id === this.accountId) return;
      this.accountId = id;
      this.generation++;
      this.abort?.abort(); this.connection?.stop(); this.connection = undefined;
      this.voice.set('off'); this.muted.set(false); this.busy.set(false); this.result.set(null); this.messages.set([]); this.caption.set(''); this.error.set(''); this.bookingSent.set(false); this.input = ''; this.userSpeech = '';
      this.voiceTask = Promise.resolve('');
      this.editing.set(false); this.taskTitle.set('What would you like to do?');
    });
    inject(DestroyRef).onDestroy(() => { this.generation++; this.abort?.abort(); this.connection?.stop(); });
    if (this.browser) void this.checkAvailability();
  }

  private async checkAvailability(): Promise<void> {
    try {
      const response = await fetch('/api/agent/status');
      if (!response.ok) throw new Error();
      const status = await response.json() as { available?: boolean };
      this.available.set(status.available === true);
    } catch { this.available.set(false); }
    finally { this.checked.set(true); }
  }

  close(): void { this.stopVoice(); }
  @HostListener('document:keydown.escape') onEscape(): void { this.stopVoice(); }
  signIn(): void { this.close(); void this.router.navigateByUrl('/account'); }

  newTask(): void {
    if (this.busy() || this.result()?.draftId || this.result()?.booking) return;
    this.stopVoice(); this.messages.set([]); this.result.set(null); this.error.set('');
    this.input = ''; this.taskTitle.set('What would you like to do?');
    if (this.browser) setTimeout(() => this.command?.nativeElement.focus());
  }

  async choose(shortcut: { title: string; path?: string; prompt?: string; action?: string }): Promise<void> {
    if (this.busy() || this.result()?.draftId) return;
    if (shortcut.action === 'booking') {
      this.taskTitle.set('Find your next appointment'); this.error.set(''); this.bookingSent.set(false);
      this.result.set({ status: 'booking', message: 'Choose a dentist and a time.', booking: { query: '', locality: '', date: '', period: 'any' } });
      this.revealTask(); return;
    }
    if (shortcut.prompt) { await this.send(shortcut.prompt); return; }
    if (!shortcut.path || !DESTINATIONS.has(shortcut.path)) return;
    const path = shortcut.path === '/workspace' ? this.directWorkspace() : shortcut.path;
    this.taskTitle.set(shortcut.title); this.error.set(''); this.busy.set(true);
    const version = this.generation;
    try {
      if (this.router.url !== path && !await this.router.navigateByUrl(path)) throw new Error('The page could not open. Please use the navigation.');
      if (version !== this.generation) return;
      this.result.set({ status: 'navigate', path, message: `${shortcut.title} is open. Continue on the page whenever you’re ready.` });
      this.revealTask();
    } catch (error) {
      if (version === this.generation) this.error.set(error instanceof Error ? error.message : 'The page could not open.');
    } finally { if (version === this.generation) this.busy.set(false); }
  }

  beginEdit(): void {
    const draft = this.result()?.draft;
    if (!draft || this.busy()) return;
    this.stopVoice(); this.editDraft = { ...draft }; this.editing.set(true);
    if (this.browser) setTimeout(() => this.editName?.nativeElement.focus());
  }

  async saveEdit(): Promise<void> {
    const id = this.result()?.draftId;
    if (!id || this.busy()) return;
    const version = this.generation;
    this.busy.set(true); this.error.set('');
    try {
      const response = await this.api.fetch(`/api/agent/drafts/${encodeURIComponent(id)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(this.editDraft),
      });
      const result = await this.read(response);
      if (version !== this.generation) return;
      this.result.set(result); this.editing.set(false);
      this.revealTask();
    } catch (error) {
      if (version === this.generation) this.error.set(error instanceof Error ? error.message : 'The details could not be updated.');
    } finally { if (version === this.generation) this.busy.set(false); }
  }

  async send(text = this.input): Promise<string> {
    const trimmed = text.trim().slice(0, 2000);
    if (!this.available() || !this.auth.currentUser()) return 'Sign in and check AI availability to send a request.';
    if (!trimmed || this.busy() || this.editing()) return 'Please finish the current request first.';
    const previous = this.result();
    if (previous?.booking && (this.bookingCard?.selected() || this.bookingSent())) {
      const changingTime = !this.bookingSent() && /^(?:please )?(?:change|edit|choose another|pick another)(?: my| the)? time(?: please)?[.!]?$/i.test(trimmed)
        && this.bookingCard?.changeTime();
      const message = changingTime ? 'Choose a new time below. Your details are kept.' : this.bookingSent() ? 'Your request is already sent. Choose Done to start another task.'
        : 'Use Change dentist to revise your search, or Change time to pick another slot. Your details are still here.';
      this.messages.update(messages => [...messages.slice(-6), { role: 'user', text: trimmed }, { role: 'assistant', text: message }]);
      this.input = ''; return message;
    }
    const version = this.generation;
    this.taskTitle.set(trimmed); this.editing.set(false);
    this.busy.set(true); this.error.set(''); this.input = '';
    const history = this.messages().slice(previous?.draft ? -7 : -8).map(message => `${message.role}: ${message.text}`.slice(0, 1000));
    if (previous?.draft) history.push(`Current clinic draft (apply only the requested changes): ${JSON.stringify(previous.draft)}`.slice(0, 1000));
    const draftId = this.result()?.draftId;
    if (!previous?.booking) this.result.set(null);
    this.messages.update(messages => [...messages.slice(-7), { role: 'user', text: trimmed }]);
    this.abort = new AbortController();
    try {
      const response = await this.api.fetch('/api/agent/turn', { method: 'POST', signal: this.abort.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: trimmed, history, draftId,
          ...(previous?.booking ? { booking: this.bookingCard?.applied ?? previous.booking } : {}) }) });
      const result = await this.read(response);
      if (version !== this.generation) return 'The account changed. This request was stopped.';
      if (previous?.booking) {
        if (result.status === 'booking' && result.booking) this.result.set(result);
        this.messages.update(messages => [...messages.slice(-7), { role: 'assistant', text: result.message }]);
      } else await this.apply(result);
      return result.message;
    } catch (error) {
      if (version !== this.generation) return 'Request stopped.';
      const message = error instanceof Error ? error.message : 'The request could not finish. Please try again.';
      this.error.set(message); return message;
    } finally { if (version === this.generation) this.busy.set(false); }
  }

  async confirm(): Promise<string> {
    const draftId = this.result()?.draftId;
    if (!draftId || this.busy() || this.editing()) return 'Please finish reviewing the clinic details before confirming.';
    const version = this.generation;
    this.busy.set(true); this.error.set('');
    try {
      const response = await this.api.fetch(`/api/agent/drafts/${encodeURIComponent(draftId)}/confirm`, { method: 'POST' });
      const result = await this.read(response);
      if (version !== this.generation) return 'Your account changed. Please check your clinic workspace.';
      // Clinic onboarding changes the role; refresh before using the guarded destination.
      if (result.refreshSession) await this.auth.resolveCurrentUser();
      if (version !== this.generation) return 'Please sign in again to open your clinic workspace.';
      await this.apply(result);
      return result.message;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please check your workspace before retrying.';
      if (version === this.generation) this.error.set(message);
      return message;
    } finally { if (version === this.generation) this.busy.set(false); }
  }

  async cancel(): Promise<void> {
    const id = this.result()?.draftId;
    if (!id || this.busy()) return;
    const version = this.generation;
    this.busy.set(true);
    try {
      const response = await this.api.fetch(`/api/agent/drafts/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('The draft could not be cancelled. Please try again.');
      if (version !== this.generation) return;
      this.result.set(null); this.error.set(''); this.messages.set([]); this.input = '';
      this.editing.set(false); this.taskTitle.set('What would you like to do?');
    } catch (error) { if (version === this.generation) this.error.set(error instanceof Error ? error.message : 'Please try again.'); }
    finally { if (version === this.generation) this.busy.set(false); }
  }

  async startVoice(): Promise<void> {
    if (!this.available() || !this.auth.currentUser()) return;
    if (this.voice() !== 'off' || this.busy() || this.editing()) return;
    this.error.set(''); this.voice.set('connecting'); this.userSpeech = ''; this.muted.set(false);
    const version = this.generation;
    const connection = new LiveConnection({
      ready: () => this.zone.run(() => { if (version === this.generation) this.voice.set('listening'); }),
      caption: (source, delta) => this.zone.run(() => {
        if (version !== this.generation) return;
        if (source === 'user') this.userSpeech = (this.userSpeech + delta).slice(-2000);
        if (this.captionSource !== source) this.captionText = '';
        this.captionSource = source; this.captionText = (this.captionText + delta).slice(-600);
        this.caption.set((source === 'user' ? 'You: ' : 'Mili: ') + this.captionText);
        this.voice.set(source === 'user' ? 'listening' : 'speaking');
      }),
      delegate: async () => {
        if (version !== this.generation) return 'This session ended.';
        const text = this.userSpeech.trim(); this.userSpeech = '';
        const draftAtRequest = this.result()?.draftId;
        this.voiceTask = this.voiceTask.catch(() => '').then(() => this.zone.run(() => {
          if (version !== this.generation) return Promise.resolve('This session ended.');
          if (/^create this clinic[.!]?$/i.test(text)) {
            return draftAtRequest && draftAtRequest === this.result()?.draftId ? this.confirm()
              : Promise.resolve('Please review the current draft first, then confirm it.');
          }
          return text ? this.send(text) : Promise.resolve('Please ask the user to repeat the request; no complete words were received.');
        }));
        return this.voiceTask;
      },
      ended: message => this.zone.run(() => { if (version === this.generation) { this.voice.set('off'); if (message) this.error.set(message); } }),
    });
    this.connection = connection;
    try {
      await connection.start(async (sdp, signal) => {
        const response = await this.api.fetch('/api/agent/voice', { method: 'POST', signal,
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sdp }) });
        if (!response.ok) { await this.read(response); throw new Error('Voice could not start.'); }
        return response.json() as Promise<{ sdp: string; maxDurationSeconds: number }>;
      });
    } catch (error) {
      if (version !== this.generation) return;
      this.voice.set('off');
      this.error.set(error instanceof DOMException && error.name === 'NotAllowedError'
        ? 'Microphone permission was denied. You can type your request.' : error instanceof Error ? error.message : 'Voice could not start.');
      this.revealTask();
    }
  }
  stopVoice(): void { this.connection?.stop(); this.connection = undefined; this.voice.set('off'); this.muted.set(false); this.userSpeech = ''; }
  toggleMute(): void { this.muted.update(muted => !muted); this.connection?.mute(this.muted()); }

  finishBooking(): void { this.result.set(null); this.bookingSent.set(false); this.newTask(); }
  onBookingSent(): void {
    this.bookingSent.set(true);
    this.messages.update(messages => [...messages.slice(-7), {
      role: 'assistant', text: 'Your request was sent. The practice will confirm your appointment. You can track it in My appointments.',
    }]);
  }

  private async read(response: Response): Promise<AgentResult> {
    const data = await response.json() as AgentResult & { detail?: string };
    if (!response.ok) throw new Error(data.detail || data.message || 'The assistant could not complete the request. Please try again.');
    return data;
  }
  private async apply(result: AgentResult): Promise<void> {
    const version = this.generation;
    if (result.path === '/workspace') result = { ...result, path: this.directWorkspace() };
    if (result.path) {
      if (!DESTINATIONS.has(result.path)) throw new Error('That destination is not supported.');
      if (result.status === 'navigate' && this.router.url !== result.path && !await this.router.navigateByUrl(result.path)) throw new Error('The page could not open. Please use the navigation.');
    }
    if (version !== this.generation) return;
    this.result.set(result);
    if (result.booking) this.bookingSent.set(false);
    this.messages.update(messages => [...messages.slice(-7), { role: 'assistant', text: result.message }]);
    if (result.status !== 'needs_input') this.revealTask();
  }

  private revealTask(): void {
    if (this.browser) setTimeout(() => {
      this.taskCanvas?.nativeElement.focus({ preventScroll: true });
      const canvas = this.taskCanvas?.nativeElement;
      if (canvas && this.mainPage() && window.matchMedia('(max-width: 760px)').matches) canvas.scrollIntoView({ block: 'start' });
    });
  }
}
