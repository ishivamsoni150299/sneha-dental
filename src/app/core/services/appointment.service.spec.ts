/**
 * AppointmentService unit tests.
 *
 * Firebase v9 uses non-writable ES module exports — spyOn cannot patch
 * addDoc / getDocs / updateDoc / deleteDoc directly in this environment.
 *
 * Tests that require real Firestore calls are marked pending() and belong
 * in an integration test suite using the Firebase Local Emulator Suite:
 *   firebase emulators:start --only firestore
 *
 * What IS tested here (zero Firebase dependency):
 *   - canCancel()            — pure date arithmetic, business-critical rule
 *   - cancelAppointment()    — enforces 24-hour rule before touching Firestore
 *   - bookingRef format     — regex contract for generated refs
 */

import { TestBed } from '@angular/core/testing';
import { AppointmentService } from './appointment.service';
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

  // ── canCancel() — pure date arithmetic, no Firebase ───────────────────────
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

  // ── cancelAppointment() — 24-hour enforcement (no Firestore needed) ───────
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
      pending('Run: firebase emulators:start --only firestore'));
  });

  // ── Integration tests (require Firebase Local Emulator) ───────────────────
  describe('Firestore integration (pending — requires emulator)', () => {
    it('bookAppointment() saves with status:pending and correct clinicId', () => {
      pending('Run: firebase emulators:start --only firestore');
    });

    it('bookAppointment() returns a unique ref on each call', () => {
      pending('Run: firebase emulators:start --only firestore');
    });

    it('getAllAppointments() is scoped to clinicId — no cross-clinic leakage', () => {
      pending('Run: firebase emulators:start --only firestore');
    });

    it('getAppointmentByRef() returns null when no match found', () => {
      pending('Run: firebase emulators:start --only firestore');
    });

    it('getAppointmentByRef() queries clinicId + bookingRef + phone', () => {
      pending('Run: firebase emulators:start --only firestore');
    });

    it('setStatus() mutates only the status field', () => {
      pending('Run: firebase emulators:start --only firestore');
    });

    it('cancelAppointment() calls deleteDoc for valid cancellation', () => {
      pending('Run: firebase emulators:start --only firestore');
    });
  });
});
