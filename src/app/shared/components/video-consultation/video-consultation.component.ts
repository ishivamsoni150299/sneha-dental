import { ChangeDetectionStrategy, Component, ElementRef, InjectionToken, OnDestroy, inject, input, signal, viewChild } from '@angular/core';
import type { DailyCall, DailyEventObjectAppMessage } from '@daily-co/daily-js';
import { VideoAccessError, VideoConsultationService, VideoSession } from '../../../core/services/video-consultation.service';
import { NativeVideoRoomComponent } from './native-video-room.component';
import { AnalyticsService } from '../../../core/services/analytics.service';
import { ConsultationChatComponent, ConsultationMessage } from './consultation-chat.component';
import { CallViewportDirective } from './call-viewport.directive';

export const VIDEO_FRAME_FACTORY = new InjectionToken<(element: HTMLElement) => Promise<DailyCall>>('Video frame factory', {
  providedIn: 'root', factory: () => async element => {
    const { default: Daily } = await import('@daily-co/daily-js');
    return Daily.createFrame(element, { iframeStyle: { width: '100%', height: '100%', border: '0' }, showLeaveButton: true });
  },
});

@Component({
  selector: 'app-video-consultation', standalone: true, imports: [NativeVideoRoomComponent, ConsultationChatComponent, CallViewportDirective], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" (click)="join()" [disabled]="loading()" class="ui-btn ui-btn-primary">
      <i class="ph ph-video-camera text-lg" aria-hidden="true"></i> {{ loading() ? 'Opening…' : 'Join video call' }}
    </button>
    <dialog #dialog appCallViewport class="video-room" aria-label="Private video consultation" (cancel)="cancelDialog($event)">
      @if (!nativeSession()) {
        <header class="flex items-center justify-between gap-2 border-b border-ui-line bg-ui-surface px-4 py-2.5 sm:px-6">
          <h2 class="text-sm font-semibold text-ui-ink">Video consultation</h2>
          <div class="flex gap-2">@if (dailyReady()) { <button type="button" (click)="toggleChat(!chatOpen())" [attr.aria-expanded]="chatOpen()" class="ui-btn ui-btn-secondary"><i class="ph ph-chat-circle-text" aria-hidden="true"></i>Chat {{ unread() ? '(' + unread() + ')' : '' }}</button> }
          <button type="button" (click)="close()" aria-label="Close video consultation" class="ui-btn ui-btn-ghost ui-btn-icon"><i class="ph ph-x text-xl" aria-hidden="true"></i></button></div>
        </header>
      }
      @if (loading()) {
        <div role="status" class="room-state"><span class="room-spinner" aria-hidden="true"></span><p class="font-semibold text-ui-ink">Preparing your private room…</p><p class="text-sm text-ui-ink-muted">This usually takes a few seconds.</p></div>
      }
      @if (error()) {
        <div role="alert" class="room-state">
          <span class="flex h-14 w-14 items-center justify-center rounded-full bg-ui-primary-soft text-ui-primary"><i class="ph ph-video-camera-slash text-2xl" aria-hidden="true"></i></span>
          <h3 class="font-semibold text-ui-ink">Video room unavailable</h3>
          <p class="max-w-md text-sm leading-6 text-ui-ink-soft">{{ error() }}</p>
          <div class="mt-2 flex flex-wrap justify-center gap-2"><button type="button" (click)="close()" class="ui-btn ui-btn-secondary">Close</button><button type="button" (click)="join()" class="ui-btn ui-btn-primary">Try again</button></div>
        </div>
      }
      @if (nativeSession(); as session) { <app-native-video-room [session]="session" [staff]="staff() || dentist()" [refreshSession]="refreshSession" (joined)="trackJoined()" (closed)="close()" /> }
      <div class="relative flex min-h-0 flex-1" [class.hidden]="!!error() || !!nativeSession() || loading()">
        <div #frame class="call-frame"></div>
        @if (dailyReady()) { <aside class="daily-chat" [class.chat-visible]="chatOpen()" [attr.inert]="chatOpen() ? null : ''" [attr.aria-hidden]="!chatOpen()"><app-consultation-chat [canPrescribe]="staff() || dentist()" [available]="dailyPeer()" [transport]="sendMessage" (received)="onMessage()" (dismissed)="toggleChat(false)" /></aside> }
      </div>
    </dialog>
  `,
  styles: [`
    .video-room{padding:0;border:0;border-radius:var(--ui-radius-lg);width:min(1120px,96vw);max-width:100vw;height:90dvh;max-height:100dvh;background:var(--ui-canvas);overflow:hidden;box-shadow:var(--ui-shadow-lg)}
    .room-state{display:flex;flex:1;flex-direction:column;align-items:center;justify-content:center;gap:.5rem;padding:1.5rem;text-align:center}
    .room-spinner{width:2.25rem;height:2.25rem;margin-bottom:.5rem;border-radius:50%;border:3px solid var(--ui-primary-soft);border-top-color:var(--ui-primary);animation:room-spin .9s linear infinite}
    @keyframes room-spin{to{transform:rotate(360deg)}}
    @media(prefers-reduced-motion:reduce){.room-spinner{animation-duration:2.4s}}
    .video-room::backdrop{background:rgb(17 24 39 / .72);backdrop-filter:blur(5px)}
    .video-room[open]{display:flex;flex-direction:column}
    .video-room header{flex-shrink:0}
    .call-frame{flex:1;min-height:0}
    .daily-chat{display:none;position:absolute;inset:0;background:white}
    .daily-chat.chat-visible{display:block}
    @media(min-width:900px){.daily-chat{position:relative;inset:auto;width:340px;flex-shrink:0}}
    @media(max-width:640px){.video-room{position:fixed;inset:var(--call-viewport-top,0px) 0 auto;margin:0;width:100%;height:var(--call-viewport-height,100dvh);border-radius:0}}
  `],
})
export class VideoConsultationComponent implements OnDestroy {
  readonly appointmentId = input.required<string>();
  readonly bookingRef = input('');
  readonly phone = input('');
  readonly staff = input(false);
  readonly dentist = input(false);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly nativeSession = signal<VideoSession | null>(null);
  readonly dailyReady = signal(false);
  readonly dailyPeer = signal(false);
  readonly chatOpen = signal(false);
  readonly unread = signal(0);
  private readonly chat = viewChild(ConsultationChatComponent);
  readonly sendMessage = async (message: ConsultationMessage): Promise<void> => {
    if (!this.call || !this.dailyPeer()) throw new Error('Not connected');
    this.call.sendAppMessage(message, '*');
  };
  toggleChat(open: boolean): void { this.chatOpen.set(open); if (open) { this.unread.set(0); setTimeout(() => this.chat()?.focus()); } }
  onMessage(): void { if (!this.chatOpen()) this.unread.update(count => count + 1); }
  private readonly appMessage = (event: DailyEventObjectAppMessage) => {
    const participant = this.call?.participants()[event.fromId];
    if (participant && !participant.local) this.chat()?.receive(event.data, participant.owner);
  };
  private readonly updatePeers = () => this.dailyPeer.set(Object.values(this.call?.participants() || {}).some(participant => !participant.local));
  readonly refreshSession = () => this.video.join(this.appointmentId(), this.staff(), this.bookingRef(), this.phone(), this.dentist());
  private readonly video = inject(VideoConsultationService);
  private readonly analytics = inject(AnalyticsService);
  private readonly createFrame = inject(VIDEO_FRAME_FACTORY);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  private readonly nativeRoom = viewChild(NativeVideoRoomComponent);
  private readonly frame = viewChild<ElementRef<HTMLDivElement>>('frame');
  private call: DailyCall | null = null;
  private generation = 0;
  private accessTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly leftMeeting = () => this.close();
  private readonly callError = () => {
    this.error.set('The call connection was interrupted. Check your connection and camera permissions, then try again.');
    this.loading.set(false);
    void this.destroyCall();
  };

  async join(): Promise<void> {
    if (this.loading()) return;
    const attempt = ++this.generation;
    const dialog = this.dialog()?.nativeElement;
    if (!dialog?.open) dialog?.showModal();
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.destroyCall();
      const session = await this.video.join(this.appointmentId(), this.staff(), this.bookingRef(), this.phone(), this.dentist());
      if (attempt !== this.generation) return;
      if (session.provider === 'livekit') {
        this.nativeSession.set(session); this.loading.set(false); this.verifyAccess(attempt); return;
      }
      const call = await this.createFrame(this.frame()!.nativeElement);
      if (attempt !== this.generation) { await call.destroy(); return; }
      this.call = call;
      this.call.on('left-meeting', this.leftMeeting);
      this.call.on('error', this.callError);
      this.call.on('app-message', this.appMessage);
      this.call.on('participant-joined', this.updatePeers);
      this.call.on('participant-left', this.updatePeers);
      this.loading.set(false);
      this.verifyAccess(attempt);
      await call.join({ url: session.url, token: session.token });
      if (attempt !== this.generation) return;
      this.dailyReady.set(true); this.updatePeers();
      this.analytics.trackVideoRoomJoined({
        appointment_id: this.appointmentId(),
        is_staff: this.staff(),
      });
    } catch (error) {
      if (attempt === this.generation) {
        this.error.set(error instanceof VideoAccessError ? error.message : 'Could not open the video room. Check your connection and browser permissions, or contact the clinic.');
        await this.destroyCall();
      }
    } finally {
      if (attempt === this.generation) this.loading.set(false);
    }
  }

  close(): void {
    this.generation++;
    this.loading.set(false);
    if (this.dialog()?.nativeElement.open) this.dialog()!.nativeElement.close();
    void this.destroyCall();
  }

  cancelDialog(event: Event): void {
    event.preventDefault();
    const room = this.nativeRoom();
    if (room) room.dismiss();
    else this.close();
  }

  ngOnDestroy(): void { this.close(); }
  trackJoined(): void { this.analytics.trackVideoRoomJoined({ appointment_id: this.appointmentId(), is_staff: this.staff() }); }

  private async destroyCall(): Promise<void> {
    clearTimeout(this.accessTimer);
    this.nativeSession.set(null);
    this.dailyReady.set(false); this.dailyPeer.set(false); this.chatOpen.set(false); this.unread.set(0);
    const call = this.call;
    this.call = null;
    if (call) {
      call.off('left-meeting', this.leftMeeting);
      call.off('error', this.callError);
      call.off('app-message', this.appMessage);
      call.off('participant-joined', this.updatePeers);
      call.off('participant-left', this.updatePeers);
      await call.destroy().catch(() => undefined);
    }
  }

  private verifyAccess(attempt: number): void {
    this.accessTimer = setTimeout(() => { void this.checkAccess(attempt); }, 15000);
  }

  private async checkAccess(attempt: number): Promise<void> {
      try {
        await this.video.checkAccess(this.appointmentId(), this.staff(), this.bookingRef(), this.phone(), this.dentist());
        if (attempt === this.generation && (this.call || this.nativeSession())) this.verifyAccess(attempt);
      } catch (error) {
        if (attempt !== this.generation) return;
        this.error.set(error instanceof VideoAccessError ? error.message : 'Could not verify this appointment. Reconnect to continue your consultation.');
        await this.destroyCall();
      }
  }
}
