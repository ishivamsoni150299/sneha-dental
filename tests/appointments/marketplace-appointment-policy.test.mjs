import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAppointmentSlotId,
  isOverdueMarketplaceRequest,
  normalizeAppointmentTime,
} from '../../api/_lib/marketplace-appointment-policy.ts';

test('builds the same normalized slot IDs as browser booking transactions', () => {
  assert.equal(normalizeAppointmentTime('9:30 PM'), '21:30');
  assert.equal(buildAppointmentSlotId({
    clinicId: 'clinic-1', doctorId: 'doctor-2', date: '2026-09-10', time: '9:30 PM',
  }), 'clinic-1_doctor-2_2026-09-10_2130');
  assert.equal(buildAppointmentSlotId({
    clinicId: 'clinic-1', doctorId: null, date: '2026-09-10', time: '09:30',
  }), 'clinic-1_any_2026-09-10_0930');
});

test('expires only overdue pending marketplace requests', () => {
  const now = new Date('2026-09-01T12:00:00Z');
  const overdue = {
    source: 'marketplace', status: 'pending', confirmationDeadline: new Date('2026-09-01T11:59:59Z'),
  };
  assert.equal(isOverdueMarketplaceRequest(overdue, now), true);
  assert.equal(isOverdueMarketplaceRequest({ ...overdue, status: 'confirmed' }, now), false);
  assert.equal(isOverdueMarketplaceRequest({ ...overdue, source: 'clinic_website' }, now), false);
  assert.equal(isOverdueMarketplaceRequest({ ...overdue, confirmationDeadline: new Date('2026-09-01T12:00:01Z') }, now), false);
});

test('accepts Firestore-style timestamp values at the deadline boundary', () => {
  const now = new Date('2026-09-01T12:00:00Z');
  assert.equal(isOverdueMarketplaceRequest({
    source: 'marketplace',
    status: 'pending',
    confirmationDeadline: { toDate: () => new Date('2026-09-01T12:00:00Z') },
  }, now), true);
});