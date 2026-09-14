import { ChangeDetectionStrategy, Component, ElementRef, InjectionToken, OnDestroy, inject, input, output, signal, viewChild } from '@angular/core';
import type { LocalTrack, Room, RemoteTrack } from 'livekit-client';
import { CHAT_TOPIC, ConsultationChatComponent, ConsultationMessage } from './consultation-chat.component';
import type { VideoSession } from '../../../core/services/video-consultation.service';

export const LIVEKIT_SDK = new InjectionToken<() => Promise<typeof import('livekit-client')>>('Self-hosted video SDK', {
  providedIn: 'root', factory: () => () => import('livekit-client'),
});

@Component({
  selector: 'app-native-video-room', standalone: true, imports: [ConsultationChatComponent], changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-0 flex-1 flex-col' },
  templateUrl: './native-video-room.component.html',
  styleUrl: './native-video-room.component.css',
})
export class NativeVideoRoomComponent implements OnDestroy {
  readonly session = input.required<VideoSession>();
  readonly staff = input(false);
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
  readonly status = signal('Ready to join');
  readonly elapsed = signal('00:00');
  readonly chatOpen = signal(false);
  readonly unread = signal(0);
  private readonly chat = viewChild(ConsultationChatComponent);
  private readonly chatToggle = viewChild<ElementRef<HTMLButtonElement>>('chatToggle');
  private devicesAttempted = false;
  readonly sendMessage = async (message: ConsultationMessage): Promise<void> => {
    if (!this.room || !this.connected() || !this.remotePresent()) throw new Error('Not connected');
    await this.room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(message)), { reliable: true, topic: CHAT_TOPIC });
  };

  toggleChat(open: boolean): void {
    this.chatOpen.set(open);
    if (open) { this.unread.set(0); setTimeout(() => this.chat()?.focus()); }
    else this.chatToggle()?.nativeElement.focus();
  }
  onMessage(): void { if (!this.chatOpen()) this.unread.update(count => count + 1); }
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
    this.devicesAttempted = true;
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

  async join(listenOnly = false): Promise<void> {
    if (this.busy() || this.connected() || this.destroyed) return;
    if (Date.parse(this.session().expiresAt) <= Date.now()) { this.error.set('This room has ended. Close it and return to your appointments.'); return; }
    const attempt = this.generation;
    if (!listenOnly && !this.devicesAttempted) await this.prepare();
    if (this.destroyed || attempt !== this.generation) return;
    if (listenOnly) { this.stopPreview(); this.cameraOn.set(false); this.micOn.set(false); this.devicesReady.set(false); }
    this.busy.set(true); this.status.set('Connecting…');
    try {
      const sdk = await this.loadSdk();
      if (this.destroyed || attempt !== this.generation) return;
      const session = await (this.refreshSession()?.() || Promise.resolve(this.session()));
      if (this.destroyed || attempt !== this.generation) return;
      const room = new sdk.Room({ adaptiveStream: true, dynacast: true });
      this.room = room;
      room.on(sdk.RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
        if (topic !== CHAT_TOPIC || !participant || payload.byteLength > 3000) return;
        try { this.chat()?.receive(JSON.parse(new TextDecoder().decode(payload)), participant.identity === 'dentist'); } catch { /* Ignore unrelated or malformed data. */ }
      });
      room.on(sdk.RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        const element = track.attach();
        if (element instanceof HTMLVideoElement) element.playsInline = true;
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
    } catch { if (!this.destroyed) { this.release(); this.status.set('Could not connect'); this.error.set('Check your internet connection, then tap Join call to try again.'); } }
    finally { if (!this.destroyed) this.busy.set(false); }
  }

  async toggle(kind: 'camera' | 'microphone'): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const enabled = !(kind === 'camera' ? this.cameraOn() : this.micOn());
      let track = this.tracks.find(track => track.kind === (kind === 'camera' ? 'video' : 'audio'));
      if (!track) {
        const attempt = this.generation;
        const sdk = await this.loadSdk();
        if (this.destroyed || attempt !== this.generation) return;
        const tracks = await sdk.createLocalTracks({ audio: kind === 'microphone', video: kind === 'camera' ? { facingMode: 'user' } : false });
        if (this.destroyed || attempt !== this.generation) { tracks.forEach(item => item.stop()); return; }
        this.tracks.push(...tracks);
        for (const item of tracks) if (this.room && this.connected()) await this.room.localParticipant.publishTrack(item);
        if (this.destroyed || attempt !== this.generation) return;
        track = tracks[0]; this.devicesReady.set(this.tracks.length > 0); this.showPreview();
      }
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
    if (track) { const element = track.attach(); element.muted = true; if (element instanceof HTMLVideoElement) element.playsInline = true; this.local()?.nativeElement.appendChild(element); }
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
    this.devicesAttempted = false; this.chatOpen.set(false); this.audioBlocked.set(false); this.elapsed.set('00:00');
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
