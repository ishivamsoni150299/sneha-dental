import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { DailyCall } from '@daily-co/daily-js';
import { AuthenticatedApiService } from '../../core/services/authenticated-api.service';
import { VIDEO_FRAME_FACTORY } from '../../shared/components/video-consultation/video-consultation.component';
import type { VideoSession } from '../../core/services/video-consultation.service';

@Component({
  selector: 'app-video-test', standalone: true, imports: [RouterLink], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div class="mx-auto max-w-6xl">
        @if (host) { <a routerLink="/professional/workspace" class="inline-flex min-h-11 items-center text-sm font-semibold text-blue-700">← Dentist workspace</a> }
        <h1 class="mt-3 text-2xl font-bold text-gray-900">Private video test</h1>
        <p class="mt-2 text-sm text-gray-600">Check your camera, microphone and connection. This is a test room for two people, separate from patient appointments.</p>
        @if (guestLink()) {
          <section class="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
            <p class="text-sm font-semibold text-blue-900">Open this temporary invitation on your second device.</p>
            <input aria-label="Temporary guest invitation" readonly [value]="guestLink()" class="mt-2 w-full rounded-lg border border-gray-300 p-3 text-sm" (focus)="$any($event.target).select()">
            <button (click)="copy()" class="mt-2 min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white">{{ copied() ? 'Copied' : 'Copy invitation' }}</button>
            <p class="mt-2 text-xs text-gray-600">Expires {{ expires() }}. Use headphones or mute one device to avoid feedback.</p>
          </section>
        }
        @if (error()) { <p role="alert" class="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">{{ error() }}</p> }
        <div class="my-4 flex gap-3">
          <button (click)="join()" [disabled]="busy() || joined()" class="min-h-12 rounded-xl bg-blue-600 px-5 font-semibold text-white disabled:opacity-50">{{ busy() ? 'Opening room…' : host ? 'Start test call' : 'Join test call' }}</button>
          @if (joined()) { <button (click)="leave()" class="min-h-12 rounded-xl border border-gray-300 px-5 font-semibold">Leave call</button> }
        </div>
        <div #frame class="overflow-hidden rounded-2xl border border-gray-200 bg-white" style="height: 65dvh; min-height: 360px" [class.hidden]="!joined() && !busy()"></div>
      </div>
    </main>
  `,
})
export class VideoTestComponent implements OnDestroy {
  readonly host = inject(ActivatedRoute).snapshot.data['host'] === true;
  private readonly api = inject(AuthenticatedApiService);
  private readonly createFrame = inject(VIDEO_FRAME_FACTORY);
  private readonly frame = viewChild<ElementRef<HTMLDivElement>>('frame');
  private readonly guestToken = typeof location !== 'undefined' ? location.hash.slice(1) : '';
  private call: DailyCall | null = null;
  private generation = 0;
  readonly busy = signal(false);
  readonly joined = signal(false);
  readonly error = signal<string | null>(null);
  readonly guestLink = signal('');
  readonly expires = signal('');
  readonly copied = signal(false);
  private readonly onLeft = () => { void this.leave(); };
  private readonly onError = () => { this.error.set('Connection interrupted. Check your camera, microphone and network, then reconnect.'); void this.leave(); };

  async join(): Promise<void> {
    if (this.busy() || this.joined()) return;
    const generation = ++this.generation;
    this.busy.set(true); this.error.set(null);
    try {
      const response = await this.api.fetch(this.host ? '/api/providers/me/video-test' : '/api/public/video-tests/join', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(this.host ? {} : { token: this.guestToken }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || data.message || 'Could not open this test room.');
      if (generation !== this.generation) return;
      const session = (this.host ? data.session : data) as VideoSession;
      const url = new URL(session.url);
      if (url.protocol !== 'https:' || !url.hostname.endsWith('.daily.co') || url.username || url.password || url.port) throw new Error('Invalid video room.');
      if (this.host) {
        this.guestLink.set(`${location.origin}/video-test#${data.guestToken}`);
        this.expires.set(new Date(data.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      }
      const call = await this.createFrame(this.frame()!.nativeElement);
      if (generation !== this.generation) { await call.destroy(); return; }
      this.call = call;
      call.on('left-meeting', this.onLeft); call.on('error', this.onError);
      this.joined.set(true);
      await call.join({ url: session.url, token: session.token });
    } catch (e) { if (generation === this.generation) { this.error.set((e as Error).message); await this.leave(); } }
    finally { if (generation === this.generation) this.busy.set(false); }
  }
  async copy(): Promise<void> {
    try { await navigator.clipboard.writeText(this.guestLink()); this.copied.set(true); }
    catch { this.error.set('Select the invitation above and copy it manually.'); }
  }
  async leave(): Promise<void> {
    this.generation++; this.joined.set(false); this.busy.set(false);
    const call = this.call; this.call = null;
    if (call) { call.off('left-meeting', this.onLeft); call.off('error', this.onError); await call.destroy().catch(() => undefined); }
  }
  ngOnDestroy(): void { void this.leave(); }
}
