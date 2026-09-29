/**
 * AppointmentService unit tests.
 *
 * API integration tests are kept separate from this unit suite.
 *
 * What IS tested here (zero network dependency):
 *   - canCancel()            — pure date arithmetic, business-critical rule
 *   - cancelAppointment()    — enforces the cancellation rule before the API call
 *   - request identity, booking conflicts, lookup errors and lifecycle guards
 */

import { TestBed } from '@angular/core/testing';
import {
  AppointmentService,
  calculateConfirmationDeadline,
  isClinicOpenAt,
} from './appointment.service';
import { ClinicConfigService } from './clinic-config.service';
import { AuthFacade, type AuthRole } from './auth-facade.service';
import { AuthenticatedApiService } from './authenticated-api.service';

const MOCK_CONFIG = {
  isLoaded: true,
  config: {
    clinicId:         'clinic-001',
    bookingRefPrefix: 'BK',
    phone:            '9999999999',
    comingSoon:       false,
  },
};

describe('AppointmentService', () => {
  let service: AppointmentService;
  let api: jasmine.SpyObj<AuthenticatedApiService>;
  let role: AuthRole | null;
  const buildAppointment = (date: string) => ({
    id: 'appt-1',
    clinicId: 'clinic-001',
    bookingRef: 'BK-ABCDEFGH',
    phone: '9999999999',
    name: 'Test Patient',
    service: 'Cleaning',
    time: '10:00 AM',
    status: 'pending' as const,
    date,
  });

  beforeEach(() => {
    role = null;
    api = jasmine.createSpyObj<AuthenticatedApiService>('AuthenticatedApiService', ['fetch']);
    TestBed.configureTestingModule({
      providers: [
        { provide: ClinicConfigService, useValue: MOCK_CONFIG },
        { provide: AuthFacade, useValue: { authReady: Promise.resolve(), role: () => role } },
        { provide: AuthenticatedApiService, useValue: api },
      ],
    });
    service = TestBed.inject(AppointmentService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ── canCancel() — pure date arithmetic ────────────────────────────────────
  describe('canCancel()', () => {
    it('returns true when appointment is 25 hours away', () => {
      const t = new Date(Date.now() + 25 * 60 * 60 * 1000);
      expect(service.canCancel(t.toISOString())).toBeTrue();
    });

    it('returns false when appointment is exactly 24 hours away', () => {
      const t = new Date(Date.now() + 24 * 60 * 60 * 1000);
      expect(service.canCancel(t.toISOString())).toBeFalse();
    });

    it('returns false when appointment is 23 hours away', () => {
      const t = new Date(Date.now() + 23 * 60 * 60 * 1000);
      expect(service.canCancel(t.toISOString())).toBeFalse();
    });

    it('returns false for a past appointment', () => {
      const t = new Date(Date.now() - 2 * 60 * 60 * 1000);
      expect(service.canCancel(t.toISOString())).toBeFalse();
    });

    it('returns false for an appointment 1 minute away', () => {
      const t = new Date(Date.now() + 60 * 1000);
      expect(service.canCancel(t.toISOString())).toBeFalse();
    });

    it('treats the boundary (exactly 24 h) as not cancellable', () => {
      // boundary test: diffHours > 24 must be strictly greater
      const tExact  = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const tPlus1s = new Date(Date.now() + 24 * 60 * 60 * 1000 + 1000);
      expect(service.canCancel(tExact.toISOString())).toBeFalse();
      expect(service.canCancel(tPlus1s.toISOString())).toBeTrue();
    });
  });

  describe('isBookable()', () => {
    it('allows a future date', () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      expect(service.isBookable(tomorrow, '09:00')).toBeTrue();
    });

    it('rejects a past date', () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      expect(service.isBookable(yesterday, '09:00')).toBeFalse();
    });

    it('rejects a past time on the current date', () => {
      jasmine.clock().install();
      jasmine.clock().mockDate(new Date('2026-04-23T14:15:00'));
      expect(service.isBookable('2026-04-23', '14:00')).toBeFalse();
      jasmine.clock().uninstall();
    });
  });

  describe('marketplace confirmation window', () => {
    const hours = [{ days: 'Monday - Saturday', time: '9:00 AM - 7:00 PM' }];

    it('sets the deadline two working hours after an in-hours request', () => {
      const deadline = calculateConfirmationDeadline(hours, new Date('2026-08-31T05:00:00.000Z'));
      expect(deadline).toEqual(new Date('2026-08-31T07:00:00.000Z'));
    });

    it('carries remaining response time into the next working window', () => {
      const deadline = calculateConfirmationDeadline(hours, new Date('2026-08-31T13:00:00.000Z'));
      expect(deadline).toEqual(new Date('2026-09-01T05:00:00.000Z'));
    });

    it('starts the response window when the clinic next opens', () => {
      const deadline = calculateConfirmationDeadline(hours, new Date('2026-08-30T14:30:00.000Z'));
      expect(deadline).toEqual(new Date('2026-08-31T05:30:00.000Z'));
      expect(isClinicOpenAt(hours, new Date('2026-08-31T04:30:00.000Z'))).toBeTrue();
      expect(isClinicOpenAt(hours, new Date('2026-08-30T04:30:00.000Z'))).toBeFalse();
    });
  });

  // ── cancelAppointment() — 24-hour enforcement ─────────────────────────────
  describe('cancelAppointment() — 24-hour rule', () => {
    it('throws when appointment is within 24 hours', async () => {
      const soon = new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString();
      await expectAsync(service.cancelAppointment(buildAppointment(soon)))
        .toBeRejectedWithError(/Cannot cancel within 24 hours/);
    });

    it('includes the clinic phone number in the error message', async () => {
      const soon = new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString();
      try {
        await service.cancelAppointment(buildAppointment(soon));
        fail('expected to throw');
      } catch (e: any) {
        expect(e.message).toContain('9999999999');
      }
    });

    it('throws for a past appointment date', async () => {
      const past = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
      await expectAsync(service.cancelAppointment(buildAppointment(past)))
        .toBeRejectedWithError(/Cannot cancel within 24 hours/);
    });
  });

  describe('API boundary (mock transport; server isolation is tested in backend/E2E)', () => {
    const future = () => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

    it('does not attach a clinic-admin identity to a public patient booking', async () => {
      role = 'clinic-admin';
      const publicFetch = spyOn(globalThis, 'fetch').and.resolveTo(new Response(JSON.stringify({ bookingRef: 'BK-SERVER01' })));
      expect(await service.bookAppointment(buildAppointment(future()))).toBe('BK-SERVER01');
      expect(publicFetch).toHaveBeenCalled();
      expect(api.fetch).not.toHaveBeenCalled();
    });

    it('uses authenticated transport for a patient booking', async () => {
      role = 'patient';
      const publicFetch = spyOn(globalThis, 'fetch');
      api.fetch.and.resolveTo(new Response(JSON.stringify({ bookingRef: 'BK-SERVER02' })));
      expect(await service.bookAppointment(buildAppointment(future()))).toBe('BK-SERVER02');
      expect(publicFetch).not.toHaveBeenCalled();
      expect(api.fetch).toHaveBeenCalled();
    });

    it('surfaces slot conflicts instead of returning a booking reference', async () => {
      role = 'patient';
      api.fetch.and.resolveTo(new Response(JSON.stringify({ detail: 'This slot is already reserved.' }), { status: 409 }));
      await expectAsync(service.bookAppointment(buildAppointment(future())))
        .toBeRejectedWithError('This slot is already reserved.');
    });

    it('returns null for an appointment lookup with no match', async () => {
      api.fetch.and.resolveTo(new Response(null, { status: 404 }));
      expect(await service.getAppointmentByRef('BK-NONE', '9999999999')).toBeNull();
    });

    it('does not disguise an unauthorized lookup as a missing booking', async () => {
      api.fetch.and.resolveTo(new Response(JSON.stringify({ detail: 'Sign in required' }), { status: 401 }));
      await expectAsync(service.getAppointmentByRef('BK-PRIVATE', '9999999999')).toBeRejectedWithError('Sign in required');
    });

    it('rejects rescheduling a completed visit before sending a request', async () => {
      await expectAsync(service.updateAppointment({ ...buildAppointment(future()), status: 'completed' }, { time: '11:00 AM' }))
        .toBeRejectedWithError(/can no longer be changed/);
      expect(api.fetch).not.toHaveBeenCalled();
    });

    it('loads clinic appointments through the server-resolved current tenant', async () => {
      api.fetch.and.resolveTo(new Response('[]'));
      expect(await service.getAllAppointments()).toEqual([]);
      expect(api.fetch).toHaveBeenCalledOnceWith('/api/clinics/current/appointments');
    });

    it('cancels a future appointment without deleting its history', async () => {
      api.fetch.and.resolveTo(new Response(null, { status: 204 }));
      await service.cancelAppointment(buildAppointment(future()));
      expect(api.fetch).toHaveBeenCalledWith('/api/public/appointments/appt-1/cancel', jasmine.objectContaining({ method: 'POST' }));
    });
  });
});
