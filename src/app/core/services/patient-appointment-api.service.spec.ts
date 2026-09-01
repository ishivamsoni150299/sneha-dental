import { TestBed } from '@angular/core/testing';
import { AuthenticatedApiService } from './authenticated-api.service';
import { PatientAppointmentApiService } from './patient-appointment-api.service';

describe('PatientAppointmentApiService', () => {
  it('sends authenticated patient actions through the shared API client', async () => {
    const api = jasmine.createSpyObj<AuthenticatedApiService>('AuthenticatedApiService', ['fetch']);
    api.fetch.and.resolveTo(new Response(JSON.stringify({ appointment: { id: 'appointment-1' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    TestBed.configureTestingModule({ providers: [{ provide: AuthenticatedApiService, useValue: api }] });
    const service = TestBed.inject(PatientAppointmentApiService);

    await service.claim('SC-ABCDEFGH');

    expect(api.fetch).toHaveBeenCalledWith('/api/patient?action=claim', jasmine.objectContaining({
      method: 'POST',
      body: JSON.stringify({ bookingRef: 'SC-ABCDEFGH' }),
    }));
  });

  it('surfaces patient-safe API errors', async () => {
    const api = jasmine.createSpyObj<AuthenticatedApiService>('AuthenticatedApiService', ['fetch']);
    api.fetch.and.resolveTo(new Response(JSON.stringify({ error: 'This appointment is unavailable.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    }));
    TestBed.configureTestingModule({ providers: [{ provide: AuthenticatedApiService, useValue: api }] });
    const service = TestBed.inject(PatientAppointmentApiService);

    await expectAsync(service.cancel('appointment-1-long')).toBeRejectedWithError('This appointment is unavailable.');
  });

  it('loads server-approved reschedule availability', async () => {
    const api = jasmine.createSpyObj<AuthenticatedApiService>('AuthenticatedApiService', ['fetch']);
    api.fetch.and.resolveTo(new Response(JSON.stringify({ slots: ['11:30', '12:00'] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    TestBed.configureTestingModule({ providers: [{ provide: AuthenticatedApiService, useValue: api }] });
    const service = TestBed.inject(PatientAppointmentApiService);

    await expectAsync(service.availability('appointment-1-long', '2026-09-10'))
      .toBeResolvedTo(['11:30', '12:00']);
    expect(api.fetch).toHaveBeenCalledWith('/api/patient?action=availability', jasmine.objectContaining({
      method: 'POST',
      body: JSON.stringify({ appointmentId: 'appointment-1-long', date: '2026-09-10' }),
    }));
  });
});