import { ChangeDetectionStrategy, Component, ElementRef, InjectionToken, OnDestroy, inject, input, output, signal, viewChild } from '@angular/core';
import type { LocalTrack, Room, RemoteTrack } from 'livekit-client';
import type { VideoSession } from '../../../core/services/video-consultation.service';

export const LIVEKIT_SDK = new InjectionToken<() => Promise<typeof import('livekit-client')>>('Self-hosted video SDK', {
  providedIn: 'root', factory: () => () => import('livekit-client'),
});

@Component({
  selector: 'app-native-video-room', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-0 flex-1 flex-col' },
  template: `
    <div class="flex min-h-0 flex-1 flex-col overflow-y-auto bg-gray-50">
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-white px-4 py-3">
        <p class="flex items-center gap-2 text-sm font-semibold text-gray-900" role="status"><span class="h-2 w-2 rounded-full" [class.bg-green-500]="connected()" [class.bg-blue-500]="!connected()"></span>{{ status() }}</p>
        <span class="text-xs tabular-nums text-gray-500">{{ elapsed() }} · Private room</span>
      </div>
      @if (error()) { <p role="alert" class="m-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">{{ error() }}</p> }
      <div class="relative m-3 flex min-h-64 flex-1 items-center justify-center overflow-hidden rounded-2xl bg-gray-900 sm:m-5">
        <div #remote class="remote-media absolute inset-0" [class.hidden]="!hasRemoteVideo()"></div>
        @if (!hasRemoteVideo() && (connected() || !cameraOn())) {
          <div class="max-w-sm px-6 py-12 text-center text-white">
            <span class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-800"><i class="ph ph-video-camera text-3xl" aria-hidden="true"></i></span>
            <h3 class="text-xl font-semibold">{{ connected() ? (remotePresent() ? 'Camera is off' : 'You’re in the waiting room') : 'Ready for your consultation?' }}</h3>
            <p class="mt-3 text-sm leading-6 text-gray-300">{{ connected() ? (remotePresent() ? 'You can still speak with each other.' : 'Stay here. The other person will appear when they join.') : 'Check your camera and microphone, then join when you’re ready.' }}</p>
          </div>
        }
        <div class="absolute overflow-hidden rounded-xl bg-gray-800" [class.local-preview]="!connected()" [class.local-thumbnail]="connected()" [class.hidden]="!connected() && !cameraOn()">
          <div #local class="local-media h-full w-full" [class.hidden]="!cameraOn()"></div>
          @if (!cameraOn()) { <div class="flex h-full items-center justify-center text-gray-300"><i class="ph ph-video-camera-slash text-2xl" aria-label="Your camera is off"></i></div> }
          <span class="absolute bottom-1 left-2 rounded bg-gray-900 px-1 text-xs text-white">You</span>
        </div>
      </div>
      @if (!connected()) {
        <div class="mx-auto w-full max-w-xl space-y-4 px-4 pb-5">
          @if (devicesReady()) {
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label class="text-xs font-semibold text-gray-700">Camera<select aria-label="Camera" (change)="switchDevice('videoinput', $any($event.target).value)" class="mt-1 min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm">@for (device of cameras(); track device.deviceId) { <option [value]="device.deviceId">{{ device.label || 'Camera' }}</option> }</select></label>
              <label class="text-xs font-semibold text-gray-700">Microphone<select aria-label="Microphone" (change)="switchDevice('audioinput', $any($event.target).value)" class="mt-1 min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm">@for (device of microphones(); track device.deviceId) { <option [value]="device.deviceId">{{ device.label || 'Microphone' }}</option> }</select></label>
            </div>
            <div class="flex items-center gap-3 text-xs text-gray-600"><span>Microphone level</span><meter min="0" max="100" [value]="micLevel()" aria-label="Microphone input level" class="h-3 flex-1"></meter></div>
          } @else { <button type="button" (click)="prepare()" [disabled]="busy()" class="auth-primary">{{ busy() ? 'Checking devices…' : 'Check camera & microphone' }}</button> }
          <p class="text-center text-xs leading-5 text-gray-500">Use headphones and a quiet space. You can join with your camera off.</p>
        </div>
      }
      @if (audioBlocked()) { <button type="button" (click)="enableAudio()" class="mx-auto mb-3 min-h-11 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white">Tap to hear the call</button> }
      <footer class="sticky bottom-0 flex flex-wrap items-center justify-center gap-2 border-t border-gray-200 bg-white px-3 py-4 sm:gap-3">
        @if (connected() && !devicesReady()) { <button type="button" (click)="prepare()" [disabled]="busy()" class="min-h-12 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white">Enable devices</button> }
        <button type="button" (click)="toggle('microphone')" [disabled]="busy() || !devicesReady()" [attr.aria-pressed]="micOn()" [attr.aria-label]="micOn() ? 'Mute microphone' : 'Unmute microphone'" class="flex min-h-12 min-w-16 flex-col items-center justify-center gap-1 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-40"><i class="ph text-xl" [class.ph-microphone]="micOn()" [class.ph-microphone-slash]="!micOn()" aria-hidden="true"></i>{{ micOn() ? 'Mute' : 'Unmute' }}</button>
        <button type="button" (click)="toggle('camera')" [disabled]="busy() || !devicesReady()" [attr.aria-pressed]="cameraOn()" [attr.aria-label]="cameraOn() ? 'Turn camera off' : 'Turn camera on'" class="flex min-h-12 min-w-16 flex-col items-center justify-center gap-1 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-40"><i class="ph text-xl" [class.ph-video-camera]="cameraOn()" [class.ph-video-camera-slash]="!cameraOn()" aria-hidden="true"></i>Camera</button>
        @if (!connected()) { <button type="button" (click)="join()" [disabled]="busy()" class="min-h-12 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{{ busy() ? 'Please wait…' : 'Join call' }}</button> }
        <button type="button" (click)="leave()" class="min-h-12 rounded-xl bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-700 sm:px-5">{{ connected() ? 'Leave' : 'Cancel' }}</button>
      </footer>
      <div #audio class="hidden"></div>
    </div>
  `,
  styles: [`
    :host ::ng-deep .remote-media video, :host ::ng-deep .local-media video { width:100%;height:100%;object-fit:contain; }
    :host ::ng-deep .local-media video { object-fit:cover;transform:scaleX(-1); }
    .local-preview{inset:0}
    .local-thumbnail{bottom:12px;right:12px;width:112px;height:96px}
    @media(min-width:640px){.local-thumbnail{width:176px;height:128px}}
    button:focus-visible,select:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
    footer{padding-bottom:max(1rem,env(safe-area-inset-bottom))}
  `],
})
export class NativeVideoRoomComponent implements OnDestroy {
  readonly session = input.required<VideoSession>();
  readonly refreshSession = input<(() => Promise<VideoSession>) | null>(null);
  readonly closed = output<void>();
  readonly joined = output<void>();
  readonly connected = signal(false);
  readonly busy = signal(false);
  readonly devicesReady = signal(false);
  readonly cameraOn = signal(false);
  readonly micOn = signal(false);
  readonly micLevel = signal(0);
  readonly hasRemoteVideo = signal(false);
  readonly remotePresent = signal(false);
  readonly audioBlocked = signal(false);
  readonly cameras = signal<MediaDeviceInfo[]>([]);
  readonly microphones = signal<MediaDeviceInfo[]>([]);
  readonly error = signal('');
  readonly status = signal('Camera & microphone check');
  readonly elapsed = signal('00:00');
  private readonly loadSdk = inject(LIVEKIT_SDK);
  private readonly local = viewChild<ElementRef<HTMLDivElement>>('local');
  private readonly remote = viewChild<ElementRef<HTMLDivElement>>('remote');
  private readonly audio = viewChild<ElementRef<HTMLDivElement>>('audio');
  private tracks: LocalTrack[] = [];
  private room: Room | null = null;
  private destroyed = false;
  private generation = 0;
  private timer?: ReturnType<typeof setInterval>;
  private audioContext?: AudioContext;
  private meterFrame = 0;

  async prepare(): Promise<void> {
    if (this.busy() || this.destroyed) return;
    this.busy.set(true); this.error.set('');
    const attempt = this.generation;
    try {
      const sdk = await this.loadSdk();
      if (this.destroyed || attempt !== this.generation) return;
      const results = await Promise.allSettled([
        sdk.createLocalTracks({ audio: true, video: false }),
        sdk.createLocalTracks({ audio: false, video: { resolution: sdk.VideoPresets.h720.resolution, facingMode: 'user' } }),
      ]);
      const tracks = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
      if (this.destroyed || attempt !== this.generation) { tracks.forEach(track => track.stop()); return; }
      this.stopPreview(); this.tracks = tracks;
      this.showPreview(); this.devicesReady.set(tracks.length > 0);
      this.cameraOn.set(tracks.some(track => track.kind === 'video')); this.micOn.set(tracks.some(track => track.kind === 'audio'));
      const failed = results.find(result => result.status === 'rejected');
      if (failed?.status === 'rejected') this.error.set(this.deviceError(failed.reason));
      if (this.room && this.connected()) for (const track of tracks) await this.room.localParticipant.publishTrack(track);
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (this.destroyed || attempt !== this.generation) return;
      this.cameras.set(devices.filter(device => device.kind === 'videoinput'));
      this.microphones.set(devices.filter(device => device.kind === 'audioinput'));
      this.startMeter();
    } catch (error) { if (!this.destroyed) this.error.set(this.deviceError(error)); }
    finally { if (!this.destroyed) this.busy.set(false); }
  }

  async join(): Promise<void> {
    if (this.busy() || this.connected() || this.destroyed) return;
    if (Date.parse(this.session().expiresAt) <= Date.now()) { this.error.set('This room has ended. Close it and return to your appointments.'); return; }
    const attempt = this.generation;
    this.busy.set(true); this.error.set(''); this.status.set('Connecting…');
    try {
      const sdk = await this.loadSdk();
      if (this.destroyed || attempt !== this.generation) return;
      const session = await (this.refreshSession()?.() || Promise.resolve(this.session()));
      if (this.destroyed || attempt !== this.generation) return;
      const room = new sdk.Room({ adaptiveStream: true, dynacast: true });
      this.room = room;
      room.on(sdk.RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        const element = track.attach();
        (track.kind === 'video' ? this.remote() : this.audio())?.nativeElement.appendChild(element);
        this.updateRemote();
      });
      room.on(sdk.RoomEvent.TrackUnsubscribed, track => { track.detach().forEach(element => element.remove()); this.updateRemote(); });
      room.on(sdk.RoomEvent.ParticipantConnected, () => this.updateRemote());
      room.on(sdk.RoomEvent.ParticipantDisconnected, () => this.updateRemote());
      room.on(sdk.RoomEvent.TrackMuted, () => this.updateRemote());
      room.on(sdk.RoomEvent.TrackUnmuted, () => this.updateRemote());
      room.on(sdk.RoomEvent.Reconnecting, () => this.status.set('Reconnecting… keep this room open'));
      room.on(sdk.RoomEvent.Reconnected, () => this.status.set('Connected'));
      room.on(sdk.RoomEvent.ConnectionQualityChanged, quality => { if (quality === sdk.ConnectionQuality.Poor) this.status.set('Weak connection · try turning your camera off'); else this.status.set('Connected'); });
      room.on(sdk.RoomEvent.AudioPlaybackStatusChanged, () => this.audioBlocked.set(!room.canPlaybackAudio));
      room.on(sdk.RoomEvent.MediaDevicesError, error => this.error.set(this.deviceError(error)));
      room.on(sdk.RoomEvent.Disconnected, () => {
        if (this.destroyed || this.room !== room) return;
        this.release(); this.status.set('Call ended'); this.error.set('You have left the room or the connection ended. Close this room and join again if your appointment is still active.');
      });
      await room.connect(session.url, session.token);
      if (this.destroyed || attempt !== this.generation) { await room.disconnect(); return; }
      for (const track of this.tracks) {
        if (this.destroyed || attempt !== this.generation) return;
        await room.localParticipant.publishTrack(track);
      }
      if (this.destroyed || attempt !== this.generation) return;
      this.connected.set(true); this.status.set('Connected'); this.updateRemote();
      this.joined.emit();
      this.stopMeter();
      const started = Date.now();
      this.timer = setInterval(() => {
        const seconds = Math.floor((Date.now() - started) / 1000);
        this.elapsed.set(`${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`);
        if (Date.now() >= Date.parse(session.expiresAt)) this.leave();
      }, 1000);
    } catch { if (!this.destroyed) { this.release(); this.status.set('Could not connect'); this.error.set('Check your internet connection and reopen the room to try again.'); } }
    finally { if (!this.destroyed) this.busy.set(false); }
  }

  async toggle(kind: 'camera' | 'microphone'): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const enabled = !(kind === 'camera' ? this.cameraOn() : this.micOn());
      const track = this.tracks.find(track => track.kind === (kind === 'camera' ? 'video' : 'audio'));
      if (!track) { this.error.set('This device is unavailable. Allow access in your browser settings, then reopen the room to check your devices.'); return; }
      if (track) { if (enabled) await track.unmute(); else await track.mute(); }
      if (!this.destroyed) (kind === 'camera' ? this.cameraOn : this.micOn).set(enabled);
    } catch (error) { this.error.set(this.deviceError(error)); }
    finally { if (!this.destroyed) this.busy.set(false); }
  }

  async switchDevice(kind: 'videoinput' | 'audioinput', id: string): Promise<void> {
    try {
      const track = this.tracks.find(track => track.kind === (kind === 'videoinput' ? 'video' : 'audio'));
      if (track && 'restartTrack' in track) await (track as import('livekit-client').LocalVideoTrack | import('livekit-client').LocalAudioTrack).restartTrack({ deviceId: { exact: id } });
      if (!this.destroyed && kind === 'audioinput') this.startMeter();
    } catch (error) { this.error.set(this.deviceError(error)); }
  }

  async enableAudio(): Promise<void> { try { await this.room?.startAudio(); this.audioBlocked.set(false); } catch { this.error.set('Tap again to enable sound in your browser.'); } }
  leave(): void { this.release(); this.closed.emit(); }
  ngOnDestroy(): void { this.destroyed = true; this.release(); }
  private showPreview(): void {
    this.local()?.nativeElement.replaceChildren();
    const track = this.tracks.find(track => track.kind === 'video');
    if (track) { const element = track.attach(); element.muted = true; this.local()?.nativeElement.appendChild(element); }
  }
  private updateRemote(): void {
    const peers = [...(this.room?.remoteParticipants.values() || [])];
    this.remotePresent.set(peers.length > 0);
    this.hasRemoteVideo.set(peers.some(peer => [...peer.videoTrackPublications.values()].some(publication => publication.isSubscribed && !publication.isMuted)));
  }
  private startMeter(): void {
    this.stopMeter();
    const track = this.tracks.find(track => track.kind === 'audio');
    if (!track) return;
    try {
      const context = new AudioContext(); this.audioContext = context;
      const analyser = context.createAnalyser(); analyser.fftSize = 256;
      context.createMediaStreamSource(new MediaStream([track.mediaStreamTrack])).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const sample = () => { analyser.getByteFrequencyData(data); this.micLevel.set(Math.min(100, Math.max(...data) / 2.55)); this.meterFrame = requestAnimationFrame(sample); };
      sample();
    } catch { /* The preview and call can still work without a level meter. */ }
  }
  private stopMeter(): void { cancelAnimationFrame(this.meterFrame); void this.audioContext?.close().catch(() => undefined); this.audioContext = undefined; }
  private stopPreview(): void { this.stopMeter(); this.tracks.forEach(track => { track.detach().forEach(element => element.remove()); track.stop(); }); this.tracks = []; }
  private release(): void {
    this.generation++; clearInterval(this.timer); this.stopPreview();
    const room = this.room; this.room = null;
    if (room) { room.removeAllListeners(); void room.disconnect().catch(() => undefined); }
    this.remote()?.nativeElement.replaceChildren(); this.audio()?.nativeElement.replaceChildren();
    this.connected.set(false); this.cameraOn.set(false); this.micOn.set(false); this.devicesReady.set(false);
    this.hasRemoteVideo.set(false); this.remotePresent.set(false);
  }
  private deviceError(error: unknown): string {
    const name = error instanceof Error ? error.name : '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return 'Camera or microphone access is blocked. Allow access in your browser’s site settings, then check your devices again.';
    if (name === 'NotFoundError') return 'No camera or microphone was found. Connect your devices and try again.';
    if (name === 'NotReadableError') return 'Another app may be using your camera or microphone. Close it and try again.';
    return 'Could not use this device. Check your camera and microphone permissions and try again.';
  }
}
