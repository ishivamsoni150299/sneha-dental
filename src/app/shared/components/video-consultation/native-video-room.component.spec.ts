import { TestBed } from '@angular/core/testing';
import { LIVEKIT_SDK, NativeVideoRoomComponent } from './native-video-room.component';
import type { LocalTrack, Room } from 'livekit-client';

describe('NativeVideoRoomComponent', () => {
  const session = { provider: 'livekit' as const, url: 'wss://video.example.com', token: 'short-lived-token', expiresAt: new Date(Date.now() + 3600000).toISOString() };
  let room: jasmine.SpyObj<Room>;
  let createTracks: jasmine.Spy;
  let audioTrack: jasmine.SpyObj<LocalTrack> & { restartTrack: jasmine.Spy };
  let sdk: typeof import('livekit-client');
  beforeEach(() => {
    room = jasmine.createSpyObj<Room>('Room', ['on', 'connect', 'disconnect', 'removeAllListeners'], {
      remoteParticipants: new Map(), localParticipant: { publishTrack: jasmine.createSpy('publishTrack').and.resolveTo(), publishData: jasmine.createSpy('publishData').and.resolveTo() } as unknown as Room['localParticipant'],
    });
    room.connect.and.resolveTo(); room.disconnect.and.resolveTo();
    audioTrack = Object.assign(jasmine.createSpyObj<LocalTrack>('audioTrack', ['stop', 'detach', 'mute', 'unmute'], { kind: 'audio' as LocalTrack['kind'] }), { restartTrack: jasmine.createSpy('restartTrack').and.resolveTo() });
    (audioTrack.detach as jasmine.Spy).and.returnValue([]);
    createTracks = jasmine.createSpy('createLocalTracks').and.callFake(async (options: { audio: boolean }) => options.audio ? [audioTrack] : []);
    class FakeRoom { constructor() { return room; } }
    sdk = {
      Room: FakeRoom, createLocalTracks: createTracks,
      VideoPresets: { h720: { resolution: {} } }, RoomEvent: { DataReceived: 'dataReceived', Reconnecting: 'reconnecting', Reconnected: 'reconnected', Disconnected: 'disconnected', ConnectionQualityChanged: 'connectionQualityChanged' }, ConnectionQuality: { Poor: 'poor' },
    } as unknown as typeof import('livekit-client');
    TestBed.configureTestingModule({ imports: [NativeVideoRoomComponent], providers: [{ provide: LIVEKIT_SDK, useValue: async () => sdk }] });
  });
  function fixture() {
    const view = TestBed.createComponent(NativeVideoRoomComponent);
    view.componentRef.setInput('session', session); view.detectChanges(); return view;
  }
  it('gets a fresh token after the camera check and releases the connection when leaving', async () => {
    const view = fixture();
    const refresh = jasmine.createSpy('refresh').and.resolveTo({ ...session, token: 'fresh-token' });
    view.componentRef.setInput('refreshSession', refresh);
    await view.componentInstance.join();
    expect(room.connect).toHaveBeenCalledWith(session.url, 'fresh-token');
    expect(view.componentInstance.connected()).toBeTrue();
    view.componentInstance.leave();
    expect(room.removeAllListeners).toHaveBeenCalled(); expect(room.disconnect).toHaveBeenCalled();
    expect(view.componentInstance.connected()).toBeFalse();
  });
  it('stops tracks returned after the room has been closed', async () => {
    let resolve!: (tracks: LocalTrack[]) => void;
    const track = jasmine.createSpyObj<LocalTrack>('track', ['stop']);
    const pendingTracks = new Promise<LocalTrack[]>(done => { resolve = done; });
    createTracks.and.returnValue(pendingTracks);
    const view = fixture(); const pending = view.componentInstance.prepare();
    await Promise.resolve(); view.destroy(); resolve([track]); await pending;
    expect(track.stop).toHaveBeenCalled(); expect(room.connect).not.toHaveBeenCalled();
  });
  it('does not connect if dismissed while refreshing access', async () => {
    let resolve!: (value: typeof session) => void;
    const view = fixture();
    view.componentRef.setInput('refreshSession', () => new Promise(done => { resolve = done; }));
    const pending = view.componentInstance.join(true); await Promise.resolve();
    view.destroy(); resolve(session); await pending;
    expect(room.connect).not.toHaveBeenCalled();
  });
  it('shows permission guidance without opening a network call', async () => {
    createTracks.and.rejectWith(new DOMException('Denied', 'NotAllowedError'));
    const view = fixture(); await view.componentInstance.prepare();
    expect(view.componentInstance.error()).toContain('site settings');
    expect(view.componentInstance.devicesReady()).toBeFalse(); expect(room.connect).not.toHaveBeenCalled();
    view.destroy();
  });
  it('does not join expired rooms', async () => {
    const view = fixture(); view.componentRef.setInput('session', { ...session, expiresAt: '2020-01-01T00:00:00Z' });
    await view.componentInstance.join(); expect(room.connect).not.toHaveBeenCalled();
    expect(view.componentInstance.error()).toContain('ended'); view.destroy();
  });
  it('joins from the primary action without a separate device check', async () => {
    const view = fixture(); await view.componentInstance.join();
    expect(createTracks).toHaveBeenCalledTimes(2);
    expect(room.connect).toHaveBeenCalled(); view.destroy();
  });
  it('allows listening without requesting device permissions', async () => {
    const view = fixture(); await view.componentInstance.join(true);
    expect(createTracks).not.toHaveBeenCalled(); expect(room.connect).toHaveBeenCalled(); view.destroy();
  });
  it('requires an explicit listen-only choice when both devices are blocked', async () => {
    createTracks.and.rejectWith(new DOMException('Denied', 'NotAllowedError'));
    const view = fixture(); await view.componentInstance.join();
    expect(room.connect).not.toHaveBeenCalled();
    expect(view.componentInstance.error()).toContain('Listen only');
    await view.componentInstance.join(true);
    expect(room.connect).toHaveBeenCalled();
    expect(view.componentInstance.error()).toBe('');
    view.destroy();
  });
  it('clears the connection error when retrying successfully', async () => {
    const view = fixture(); room.connect.and.rejectWith(new Error('Offline'));
    await view.componentInstance.join(true);
    expect(view.componentInstance.error()).toContain('internet');
    room.connect.and.resolveTo(); await view.componentInstance.join(true);
    expect(view.componentInstance.connected()).toBeTrue();
    expect(view.componentInstance.error()).toBe(''); view.destroy();
  });
  it('keeps reconnection status and blocks chat until the connection returns', async () => {
    const view = fixture(); await view.componentInstance.join(true);
    view.componentInstance.remotePresent.set(true);
    const handler = (event: string) => room.on.calls.allArgs().find(args => args[0] === event)![1] as (...args: unknown[]) => void;
    handler('reconnecting')();
    handler('connectionQualityChanged')('excellent', room.localParticipant);
    expect(view.componentInstance.status()).toContain('Reconnecting');
    await expectAsync(view.componentInstance.sendMessage({ type: 'consultation-chat', id: '1', kind: 'message', text: 'Hello' })).toBeRejected();
    handler('reconnected')();
    expect(view.componentInstance.reconnecting()).toBeFalse();
    expect(view.componentInstance.status()).toBe('Connected'); view.destroy();
  });
  it('publishes chat only while another participant is present', async () => {
    const view = fixture(); await view.componentInstance.join(true);
    const message = { type: 'consultation-chat' as const, id: '1', kind: 'message' as const, text: 'Hello' };
    await expectAsync(view.componentInstance.sendMessage(message)).toBeRejected();
    view.componentInstance.remotePresent.set(true);
    await view.componentInstance.sendMessage(message);
    expect(room.localParticipant.publishData).toHaveBeenCalledWith(jasmine.any(Uint8Array), { reliable: true, topic: 'consultation-chat' });
    view.destroy();
  });
  it('serializes device switching and stops a late restart after leaving', async () => {
    const view = fixture(); await view.componentInstance.prepare();
    let finish!: () => void;
    audioTrack.restartTrack.and.returnValue(new Promise<void>(resolve => { finish = resolve; }));
    const pending = view.componentInstance.switchDevice('audioinput', 'headset');
    expect(view.componentInstance.busy()).toBeTrue();
    await view.componentInstance.switchDevice('audioinput', 'other');
    expect(audioTrack.restartTrack).toHaveBeenCalledTimes(1);
    view.componentInstance.leave();
    audioTrack.stop.calls.reset();
    finish(); await pending;
    expect(audioTrack.stop).toHaveBeenCalled();
    expect(view.componentInstance.busy()).toBeFalse();
    expect(view.componentInstance.micOn()).toBeFalse(); view.destroy();
  });
  it('does not restore microphone state when unmuting finishes after leaving', async () => {
    const view = fixture(); await view.componentInstance.prepare();
    await view.componentInstance.toggle('microphone');
    let finish!: () => void;
    (audioTrack.unmute as jasmine.Spy).and.returnValue(new Promise<void>(resolve => { finish = resolve; }));
    const pending = view.componentInstance.toggle('microphone');
    view.componentInstance.leave(); audioTrack.stop.calls.reset();
    finish(); await pending;
    expect(view.componentInstance.micOn()).toBeFalse();
    expect(audioTrack.stop).toHaveBeenCalled(); view.destroy();
  });
  it('allows retry after a failed device switch and clears its error', async () => {
    const view = fixture(); await view.componentInstance.prepare();
    audioTrack.restartTrack.and.rejectWith(new DOMException('Busy', 'NotReadableError'));
    await view.componentInstance.switchDevice('audioinput', 'headset');
    expect(view.componentInstance.error()).toContain('Another app');
    expect(view.componentInstance.busy()).toBeFalse();
    audioTrack.restartTrack.and.resolveTo();
    await view.componentInstance.switchDevice('audioinput', 'headset');
    expect(view.componentInstance.error()).toBe(''); view.destroy();
  });
  it('ignores a late connection failure after leaving and rejoining', async () => {
    const view = fixture();
    let fail!: (error: Error) => void;
    room.connect.and.returnValue(new Promise<void>((_resolve, reject) => { fail = reject; }));
    const pending = view.componentInstance.join(true);
    // Let SDK loading and access refresh reach the initial connection attempt.
    await Promise.resolve(); await Promise.resolve();
    expect(room.connect).toHaveBeenCalledTimes(1);
    view.componentInstance.leave();
    room.connect.and.resolveTo(); await view.componentInstance.join(true);
    room.disconnect.calls.reset();
    fail(new Error('Old connection timed out')); await pending;
    expect(view.componentInstance.connected()).toBeTrue();
    expect(view.componentInstance.error()).toBe('');
    expect(room.disconnect).not.toHaveBeenCalled(); view.destroy();
  });
});
