import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import type { DailyCall } from '@daily-co/daily-js';
import { AuthenticatedApiService } from '../../core/services/authenticated-api.service';
import { VIDEO_FRAME_FACTORY } from '../../shared/components/video-consultation/video-consultation.component';
import { VideoTestComponent } from './video-test.component';

describe('VideoTestComponent', () => {
  it('joins using the server url and token, exposes the guest invitation and cleans up media', async () => {
    const call = jasmine.createSpyObj<DailyCall>('DailyCall', ['join', 'destroy', 'on', 'off']);
    call.join.and.resolveTo({} as never); call.destroy.and.resolveTo();
    const api = jasmine.createSpyObj<AuthenticatedApiService>('Api', ['fetch']);
    api.fetch.and.resolveTo(new Response(JSON.stringify({ session: { url: 'https://test.daily.co/room', token: 'private-room-token' }, guestToken: 'signed-invitation', expiresAt: '2026-12-01T05:30:00Z' })));
    TestBed.configureTestingModule({ imports: [VideoTestComponent], providers: [provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { data: { host: true } } } },
      { provide: AuthenticatedApiService, useValue: api }, { provide: VIDEO_FRAME_FACTORY, useValue: async () => call },
    ] });
    const fixture = TestBed.createComponent(VideoTestComponent); fixture.detectChanges();
    await fixture.componentInstance.join();
    expect(call.join).toHaveBeenCalledWith({ url: 'https://test.daily.co/room', token: 'private-room-token' });
    expect(fixture.componentInstance.guestLink()).toContain('/video-test#signed-invitation');
    expect(fixture.componentInstance.guestLink()).not.toContain('private-room-token');
    await fixture.componentInstance.leave();
    expect(call.destroy).toHaveBeenCalled();
    expect(fixture.componentInstance.joined()).toBeFalse();
  });
});
