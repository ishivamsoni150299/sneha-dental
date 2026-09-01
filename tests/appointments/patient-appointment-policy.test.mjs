import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculatePatientConfirmationDeadline,
  canPatientCancelAppointment,
  canPatientManageAppointment,
  canClaimPatientAppointment,
  normalizeIndianPatientPhone,
  normalizePatientBookingRef,
  normalizePatientReschedule,
  isPatientRescheduleSlotAllowed,
  patientRescheduleSlotsForDate,
  toPatientAppointmentDto,
  verifiedPatientIdentity,
} from '../../api/_lib/patient-appointment-policy.ts';

test('accepts only a Firebase phone identity with an Indian mobile number', () => {
  assert.deepEqual(verifiedPatientIdentity({
    uid: 'patient-1',
    phone_number: '+91 98765 43210',
    firebase: { sign_in_provider: 'phone' },
  }), { uid: 'patient-1', phoneE164: '+919876543210' });
  assert.equal(verifiedPatientIdentity({
    uid: 'patient-1',
    phone_number: '+919876543210',
    firebase: { sign_in_provider: 'password' },
  }), null);
  assert.equal(normalizeIndianPatientPhone('12345'), null);
});

test('claims only an unowned or same-owner appointment with the verified phone', () => {
  const identity = { uid: 'patient-1', phoneE164: '+919876543210' };
  assert.equal(canClaimPatientAppointment({ phoneE164: '+919876543210' }, identity), true);
  assert.equal(canClaimPatientAppointment({ phone: '98765 43210' }, identity), true);
  assert.equal(canClaimPatientAppointment({ patientUid: 'patient-1', phoneE164: '9876543210' }, identity), true);
  assert.equal(canClaimPatientAppointment({ patientUid: 'patient-2', phoneE164: '+919876543210' }, identity), false);
  assert.equal(canClaimPatientAppointment({ phoneE164: '+919000000000' }, identity), false);
});

test('projects an appointment without clinical, billing, or contact secrets', () => {
  const timestamp = { toDate: () => new Date('2026-09-01T10:00:00.000Z') };
  const dto = toPatientAppointmentDto({
    id: 'appointment-1', clinicId: 'clinic-1', bookingRef: 'SC-ABCDEFGH',
    name: 'Riya Sharma', phone: '+919876543210', email: 'riya@example.com',
    service: 'Consultation', date: '2026-09-10', time: '10:00', status: 'pending',
    clinicNotes: 'Internal diagnosis', treatmentDone: 'Private treatment',
    amountCharged: 1200, paymentStatus: 'paid', lookupKey: 'private-key',
    createdAt: timestamp,
  }, {
    name: 'Smile Care', phone: '+91 90000 00000', addressLine1: 'Sector 18', city: 'Noida',
    adminUid: 'clinic-admin', subscriptionStatus: 'active', marketplaceSlug: 'smile-care-noida',
  });

  assert.equal(dto.clinicName, 'Smile Care');
  assert.equal(dto.createdAt, '2026-09-01T10:00:00.000Z');
  for (const forbidden of [
    'phone', 'email', 'phoneE164', 'patientUid', 'clinicNotes', 'treatmentDone',
    'amountCharged', 'paymentStatus', 'lookupKey', 'adminUid', 'subscriptionStatus',
  ]) {
    assert.equal(Object.hasOwn(dto, forbidden), false, `${forbidden} must not be exposed`);
  }
});

test('normalizes claim references and rejects malformed values', () => {
  assert.equal(normalizePatientBookingRef(' sc-ab12cd34 '), 'SC-AB12CD34');
  assert.equal(normalizePatientBookingRef('SC-123'), null);
});

test('allows only linked owners to manage active future appointments', () => {
  const identity = { uid: 'patient-1', phoneE164: '+919876543210' };
  const appointment = {
    patientUid: 'patient-1', phoneE164: '+919876543210', status: 'confirmed',
    date: '2026-09-10', time: '10:00',
  };
  assert.equal(canPatientManageAppointment(appointment, identity), true);
  assert.equal(canPatientCancelAppointment(appointment, identity, new Date('2026-09-01T00:00:00Z')), true);
  assert.equal(canPatientCancelAppointment(appointment, identity, new Date('2026-09-10T03:00:00Z')), false);
  assert.equal(canPatientManageAppointment({ ...appointment, patientUid: 'patient-2' }, identity), false);
  assert.deepEqual(
    normalizePatientReschedule('2026-09-11', '11:30', new Date('2026-09-01T00:00:00Z')),
    { date: '2026-09-11', time: '11:30' },
  );
  assert.equal(normalizePatientReschedule('2026-02-30', '11:30'), null);
});

test('carries a two-working-hour response window across India clinic hours', () => {
  const hours = [{ days: 'Monday - Saturday', time: '9:00 AM - 7:00 PM' }];
  assert.equal(
    calculatePatientConfirmationDeadline(hours, new Date('2026-09-07T12:30:00.000Z')).toISOString(),
    '2026-09-08T04:30:00.000Z',
  );
  assert.equal(
    calculatePatientConfirmationDeadline(hours, new Date('2026-09-06T06:30:00.000Z')).toISOString(),
    '2026-09-07T05:30:00.000Z',
  );
});

test('allows reschedules only during active clinic or doctor schedules', () => {
  const clinic = {
    active: true,
    hours: [{ days: 'Monday - Saturday', time: '9:00 AM - 7:00 PM' }],
  };
  assert.equal(isPatientRescheduleSlotAllowed('2026-09-07', '10:00', clinic), true);
  assert.equal(isPatientRescheduleSlotAllowed('2026-09-06', '10:00', clinic), false);
  assert.equal(isPatientRescheduleSlotAllowed('2026-09-07', '10:15', clinic), false);
  assert.equal(isPatientRescheduleSlotAllowed('2026-09-07', '10:00', { ...clinic, active: false }), false);

  const doctor = {
    available: true,
    schedule: {
      mon: { enabled: true, start: '11:00', end: '13:00' },
    },
  };
  assert.equal(isPatientRescheduleSlotAllowed('2026-09-07', '11:30', clinic, doctor), true);
  assert.equal(isPatientRescheduleSlotAllowed('2026-09-07', '10:00', clinic, doctor), false);
  assert.equal(isPatientRescheduleSlotAllowed('2026-09-07', '11:30', clinic, { ...doctor, available: false }), false);
  assert.deepEqual(
    patientRescheduleSlotsForDate('2026-09-07', clinic, doctor, new Date('2026-09-01T00:00:00Z')),
    ['11:00', '11:30', '12:00', '12:30'],
  );
  assert.deepEqual(
    patientRescheduleSlotsForDate('2026-09-07', clinic, doctor, new Date('2026-09-07T06:00:00Z')),
    ['12:00', '12:30'],
  );
});