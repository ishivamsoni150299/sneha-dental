import { TestBed } from '@angular/core/testing';
import { VideoConsultationService } from './video-consultation.service';
import { AuthenticatedApiService } from './authenticated-api.service';

describe('VideoConsultationService', () => {
  const session = { url:'https://example.daily.co/private', token:'test-token', expiresAt:'2026-12-01T05:30:00Z' };
  let api: jasmine.SpyObj<AuthenticatedApiService>;
  let fetchSpy: jasmine.Spy;
  let service: VideoConsultationService;
  beforeEach(() => {
    api = jasmine.createSpyObj('AuthenticatedApiService', ['fetch']);
    api.fetch.and.resolveTo(new Response(JSON.stringify(session), {status:200}));
    TestBed.configureTestingModule({providers:[{provide:AuthenticatedApiService, useValue:api}]});
    fetchSpy = spyOn(globalThis, 'fetch').and.resolveTo(new Response(JSON.stringify(session), {status:200}));
    service = TestBed.inject(VideoConsultationService);
  });
  it('sends patient access credentials only in a POST body', async () => {
    await service.join('appointment-1', false, 'BK-ABCDEFGH', '9999999999');
    const [url, init] = fetchSpy.calls.mostRecent().args;
    expect(url).toBe('/api/public/appointments/appointment-1/video/join');
    expect(JSON.parse(init.body)).toEqual({bookingRef:'BK-ABCDEFGH',phone:'9999999999'});
    expect(api.fetch).not.toHaveBeenCalled();
  });
  it('uses authenticated clinic access for staff', async () => {
    await service.join('appointment-1', true, '', '');
    expect(api.fetch).toHaveBeenCalledWith('/api/clinics/current/appointments/appointment-1/video/join', jasmine.objectContaining({method:'POST'}));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('rejects a room on an untrusted domain', async () => {
    fetchSpy.and.resolveTo(new Response(JSON.stringify({...session,url:'https://daily.co.example.com/room'}),{status:200}));
    await expectAsync(service.join('appointment-1',false,'BK-ABCDEFGH','9999999999')).toBeRejected();
  });
});
