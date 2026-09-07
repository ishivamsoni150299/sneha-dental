import { TestBed } from '@angular/core/testing';
import type { DailyCall } from '@daily-co/daily-js';
import { VIDEO_FRAME_FACTORY, VideoConsultationComponent } from './video-consultation.component';
import { VideoAccessError, VideoConsultationService } from '../../../core/services/video-consultation.service';

describe('VideoConsultationComponent', () => {
  const session = { url: 'https://example.daily.co/test', token: 'private-token', expiresAt: '2026-12-01T05:30:00Z' };
  let video: jasmine.SpyObj<VideoConsultationService>;
  let call: jasmine.SpyObj<DailyCall>;
  beforeEach(() => {
    video = jasmine.createSpyObj('VideoConsultationService', ['join', 'checkAccess']);
    video.join.and.resolveTo(session);
    video.checkAccess.and.resolveTo();
    call = jasmine.createSpyObj('DailyCall', ['join', 'destroy', 'on', 'off']);
    call.join.and.resolveTo({} as never);
    call.destroy.and.resolveTo();
    TestBed.configureTestingModule({ imports: [VideoConsultationComponent], providers: [
      { provide: VideoConsultationService, useValue: video },
      { provide: VIDEO_FRAME_FACTORY, useValue: async () => call },
    ] });
  });

  function fixture() {
    const fixture = TestBed.createComponent(VideoConsultationComponent);
    fixture.componentRef.setInput('appointmentId', 'appointment-1');
    fixture.componentRef.setInput('bookingRef', 'BK-ABCDEFGH');
    fixture.componentRef.setInput('phone', '9999999999');
    fixture.detectChanges(); return fixture;
  }

  it('joins with the patient credentials and destroys media on close', async () => {
    const view = fixture();
    await view.componentInstance.join();
    expect(video.join).toHaveBeenCalledWith('appointment-1', false, 'BK-ABCDEFGH', '9999999999');
    expect(call.join).toHaveBeenCalledWith({ url: session.url, token: session.token });
    view.componentInstance.close();
    expect(call.destroy).toHaveBeenCalled();
    expect(view.nativeElement.querySelector('dialog').open).toBeFalse();
  });

  it('shows actionable server errors without creating a call', async () => {
    video.join.and.rejectWith(new VideoAccessError('Your video room opens 10 minutes before the appointment.'));
    const view = fixture(); await view.componentInstance.join(); view.detectChanges();
    expect(view.nativeElement.textContent).toContain('opens 10 minutes');
    expect(call.join).not.toHaveBeenCalled();
    view.componentInstance.close();
  });

  it('does not open a call after the dialog has been dismissed during loading', async () => {
    let resolve!: (value: typeof session) => void;
    video.join.and.returnValue(new Promise(done => { resolve = done; }));
    const view = fixture(); const pending = view.componentInstance.join();
    await Promise.resolve(); view.componentInstance.close(); resolve(session); await pending;
    expect(call.join).not.toHaveBeenCalled();
  });
});
