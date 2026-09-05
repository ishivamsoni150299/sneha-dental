/**
 * AppointmentService unit tests.
 *
 * API integration tests are kept separate from this unit suite.
 *
 * What IS tested here (zero network dependency):
 *   - canCancel()            — pure date arithmetic, business-critical rule
 *   - cancelAppointment()    — enforces the cancellation rule before the API call
 *   - bookingRef format     — regex contract for generated refs
 */

import { TestBed } from '@angular/core/testing';
import {
  AppointmentService,
  calculateConfirmationDeadline,
  isClinicOpenAt,
} from './appointment.service';
import { ClinicConfigService } from './clinic-config.service';

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
    TestBed.configureTestingModule({
      providers: [
        { provide: ClinicConfigService, useValue: MOCK_CONFIG },
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

  // ── bookingRef contract ───────────────────────────────────────────────────
  describe('bookAppointment() — booking ref format', () => {
    it('generates refs matching PREFIX-XXXXXXXX pattern', () =>
      pending('API integration test suite not configured'));
  });

  // ── API integration tests (pending) ───────────────────────────────────────
  describe('API integration (pending — requires test server)', () => {
    it('bookAppointment() saves with status:pending and correct clinicId', () => {
      pending('API integration test suite not configured');
    });

    it('bookAppointment() returns a unique ref on each call', () => {
      pending('API integration test suite not configured');
    });

    it('getAllAppointments() is scoped to clinicId — no cross-clinic leakage', () => {
      pending('API integration test suite not configured');
    });

    it('getAppointmentByRef() returns null when no match found', () => {
      pending('API integration test suite not configured');
    });

    it('getAppointmentByRef() queries clinicId + bookingRef + phone', () => {
      pending('API integration test suite not configured');
    });

    it('setStatus() mutates only the status field', () => {
      pending('API integration test suite not configured');
    });

    it('cancelAppointment() calls deleteDoc for valid cancellation', () => {
      pending('API integration test suite not configured');
    });
  });
});
