import { Component, DestroyRef, ElementRef, HostListener, NgZone, PLATFORM_ID, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthFacade } from '../../../core/services/auth-facade.service';
import { AuthenticatedApiService } from '../../../core/services/authenticated-api.service';
import { LiveConnection } from './live-connection';

interface AgentResult {
  status: 'needs_input' | 'navigate' | 'needs_confirmation' | 'succeeded';
  message: string;
  path?: string;
  draftId?: string;
  draft?: { name: string; phone: string; city: string; slug: string; plan: string };
  refreshSession?: boolean;
}
interface Message { role: 'user' | 'assistant'; text: string }
const DESTINATIONS = new Set(['/dentists', '/appointments', '/workspace', '/account', '/business/signup', '/business/clinic/settings', '/business/clinic/dashboard']);

@Component({
  selector: 'app-platform-agent', standalone: true, imports: [FormsModule],
  templateUrl: './platform-agent.component.html', styleUrl: './platform-agent.component.css',
})
export class PlatformAgentComponent {
  readonly auth = inject(AuthFacade);
  private readonly api = inject(AuthenticatedApiService);
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  @ViewChild('launcher') launcher?: ElementRef<HTMLButtonElement>;
  @ViewChild('command') command?: ElementRef<HTMLInputElement>;
  readonly open = signal(false);
  readonly available = signal(false);
  readonly checked = signal(false);
  readonly busy = signal(false);
  readonly voice = signal<'off' | 'connecting' | 'listening' | 'speaking'>('off');
  readonly muted = signal(false);
  readonly messages = signal<Message[]>([]);
  readonly result = signal<AgentResult | null>(null);
  readonly error = signal('');
  readonly caption = signal('');
  readonly state = computed(() => this.busy() ? 'working' : this.result()?.draftId ? 'review' : this.voice() !== 'off' ? this.voice() : 'idle');
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
    effect(() => {
      const id = this.auth.currentUser()?.uid ?? null;
      if (id === this.accountId) return;
      this.accountId = id;
      this.generation++;
      this.abort?.abort(); this.connection?.stop(); this.connection = undefined;
      this.voice.set('off'); this.busy.set(false); this.result.set(null); this.messages.set([]); this.caption.set(''); this.input = ''; this.userSpeech = '';
      this.voiceTask = Promise.resolve('');
    });
    inject(DestroyRef).onDestroy(() => { this.generation++; this.abort?.abort(); this.connection?.stop(); });
    if (this.browser) void this.checkAvailability();
  }

  async show(): Promise<void> {
    this.open.set(true);
    if (this.browser) setTimeout(() => this.command?.nativeElement.focus());
    if (!this.checked()) await this.checkAvailability();
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

  close(): void { this.stopVoice(); this.open.set(false); this.launcher?.nativeElement.focus(); }
  @HostListener('document:keydown.escape') onEscape(): void { if (this.open()) this.close(); }
  signIn(): void { this.close(); void this.router.navigateByUrl('/account'); }

  async send(text = this.input): Promise<string> {
    const trimmed = text.trim().slice(0, 2000);
    if (!trimmed || this.busy()) return 'Please wait for the current request to finish.';
    const version = this.generation;
    this.busy.set(true); this.error.set(''); this.input = '';
    const history = this.messages().slice(-8).map(message => `${message.role}: ${message.text}`.slice(0, 1000));
    const draftId = this.result()?.draftId;
    this.result.set(null);
    this.messages.update(messages => [...messages.slice(-7), { role: 'user', text: trimmed }]);
    this.abort = new AbortController();
    try {
      const response = await this.api.fetch('/api/agent/turn', { method: 'POST', signal: this.abort.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: trimmed, history, draftId }) });
      const result = await this.read(response);
      if (version !== this.generation) return 'The account changed. This request was stopped.';
      await this.apply(result);
      return result.message;
    } catch (error) {
      if (version !== this.generation) return 'Request stopped.';
      const message = error instanceof Error ? error.message : 'The request could not finish. Please try again.';
      this.error.set(message); return message;
    } finally { if (version === this.generation) this.busy.set(false); }
  }

  async confirm(): Promise<string> {
    const draftId = this.result()?.draftId;
    if (!draftId || this.busy()) return 'There is no clinic draft ready to confirm.';
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
      this.result.set(null); this.error.set('');
    } catch (error) { if (version === this.generation) this.error.set(error instanceof Error ? error.message : 'Please try again.'); }
    finally { if (version === this.generation) this.busy.set(false); }
  }

  async startVoice(): Promise<void> {
    if (this.voice() !== 'off' || this.busy()) return;
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
    }
  }
  stopVoice(): void { this.connection?.stop(); this.connection = undefined; this.voice.set('off'); this.userSpeech = ''; }
  toggleMute(): void { this.muted.update(muted => !muted); this.connection?.mute(this.muted()); }

  private async read(response: Response): Promise<AgentResult> {
    const data = await response.json() as AgentResult & { detail?: string };
    if (!response.ok) throw new Error(data.detail || data.message || 'The assistant could not complete the request. Please try again.');
    return data;
  }
  private async apply(result: AgentResult): Promise<void> {
    this.result.set(result);
    this.messages.update(messages => [...messages.slice(-7), { role: 'assistant', text: result.message }]);
    if (result.path) {
      if (!DESTINATIONS.has(result.path)) throw new Error('That destination is not supported.');
      if (!await this.router.navigateByUrl(result.path)) throw new Error('The page could not open. Please use the navigation.');
    }
  }
}
