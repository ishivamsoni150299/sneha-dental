import { ChangeDetectionStrategy, Component, ElementRef, InjectionToken, OnDestroy, inject, input, signal, viewChild } from '@angular/core';
import type { DailyCall } from '@daily-co/daily-js';
import { VideoAccessError, VideoConsultationService } from '../../../core/services/video-consultation.service';

export const VIDEO_FRAME_FACTORY = new InjectionToken<(element: HTMLElement) => Promise<DailyCall>>('Video frame factory', {
  providedIn: 'root', factory: () => async element => {
    const { default: Daily } = await import('@daily-co/daily-js');
    return Daily.createFrame(element, { iframeStyle: { width: '100%', height: '100%', border: '0' }, showLeaveButton: true });
  },
});

@Component({
  selector: 'app-video-consultation', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" (click)="join()" [disabled]="loading()" class="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
      <i class="ph ph-video-camera" aria-hidden="true"></i> {{ staff() ? 'Start video consultation' : 'Join video consultation' }}
    </button>
    <dialog #dialog class="video-room" aria-label="Private video consultation" (cancel)="close()">
      <header class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3 sm:px-6">
        <div><h2 class="font-semibold text-gray-900">Your video consultation</h2><p class="mt-1 text-xs text-gray-500">Allow camera and microphone access when prompted.</p></div>
        <button type="button" (click)="close()" class="min-h-11 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700">Leave room</button>
      </header>
      @if (loading()) {<p role="status" class="p-6 text-center text-sm text-gray-600">Preparing your private room…</p>}
      @if (error()) {
        <div role="alert" class="mx-auto max-w-lg p-6 text-center"><i class="ph ph-video-camera-slash text-4xl text-blue-600" aria-hidden="true"></i><p class="mt-4 text-sm leading-6 text-gray-700">{{ error() }}</p><button type="button" (click)="join()" class="mt-5 min-h-11 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white">Try again</button></div>
      }
      <div #frame class="call-frame" [class.hidden]="!!error()"></div>
    </dialog>
  `,
  styles: [`
    .video-room{padding:0;border:0;border-radius:18px;width:min(1120px,96vw);max-width:100vw;height:90dvh;max-height:100dvh;background:white;overflow:hidden}
    .video-room::backdrop{background:rgb(17 24 39 / .72);backdrop-filter:blur(5px)}
    .video-room[open]{display:flex;flex-direction:column}
    .video-room header{flex-shrink:0}
    .call-frame{flex:1;min-height:0}
    @media(max-width:640px){.video-room{width:100%;height:100dvh;border-radius:0}}
  `],
})
export class VideoConsultationComponent implements OnDestroy {
  readonly appointmentId = input.required<string>();
  readonly bookingRef = input('');
  readonly phone = input('');
  readonly staff = input(false);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  private readonly video = inject(VideoConsultationService);
  private readonly createFrame = inject(VIDEO_FRAME_FACTORY);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
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
      const session = await this.video.join(this.appointmentId(), this.staff(), this.bookingRef(), this.phone());
      if (attempt !== this.generation) return;
      const call = await this.createFrame(this.frame()!.nativeElement);
      if (attempt !== this.generation) { await call.destroy(); return; }
      this.call = call;
      this.call.on('left-meeting', this.leftMeeting);
      this.call.on('error', this.callError);
      this.loading.set(false);
      this.verifyAccess(attempt);
      await call.join({ url: session.url, token: session.token });
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

  ngOnDestroy(): void { this.close(); }

  private async destroyCall(): Promise<void> {
    clearTimeout(this.accessTimer);
    const call = this.call;
    this.call = null;
    if (call) {
      call.off('left-meeting', this.leftMeeting);
      call.off('error', this.callError);
      await call.destroy().catch(() => undefined);
    }
  }

  private verifyAccess(attempt: number): void {
    this.accessTimer = setTimeout(() => { void this.checkAccess(attempt); }, 15000);
  }

  private async checkAccess(attempt: number): Promise<void> {
      try {
        await this.video.checkAccess(this.appointmentId(), this.staff(), this.bookingRef(), this.phone());
        if (attempt === this.generation && this.call) this.verifyAccess(attempt);
      } catch (error) {
        if (attempt !== this.generation) return;
        this.error.set(error instanceof VideoAccessError ? error.message : 'Could not verify this appointment. Reconnect to continue your consultation.');
        await this.destroyCall();
      }
  }
}
