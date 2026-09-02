import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appointmentReviewId,
  canSubmitAppointmentReview,
  normalizeAppointmentReviewInput,
  normalizeAppointmentReviewReport,
  normalizeClinicReviewResponse,
  patientReviewAlias,
  toPatientAppointmentReviewDto,
  toPublicAppointmentReviewDto,
} from '../../api/_lib/appointment-review-policy.ts';

const identity = { uid: 'patient-123', phoneE164: '+919876543210' };
const completedAppointment = {
  id: 'appointment-1234567890',
  patientUid: identity.uid,
  phoneE164: identity.phoneE164,
  status: 'completed',
};

test('allows one deterministic review only for the linked completed appointment', () => {
  const first = appointmentReviewId(completedAppointment.id);
  assert.equal(first, appointmentReviewId(completedAppointment.id));
  assert.match(first, /^review_[a-f0-9]{64}$/);
  assert.equal(canSubmitAppointmentReview(completedAppointment, identity), true);
  assert.equal(canSubmitAppointmentReview({ ...completedAppointment, status: 'confirmed' }, identity), false);
  assert.equal(canSubmitAppointmentReview({ ...completedAppointment, patientUid: 'other-patient' }, identity), false);
  assert.equal(canSubmitAppointmentReview({ ...completedAppointment, phoneE164: '+919000000000' }, identity), false);
});

test('normalizes safe review input and privacy-preserving aliases', () => {
  assert.deepEqual(normalizeAppointmentReviewInput(5, '  Kind and clear.  ', false), {
    rating: 5,
    text: 'Kind and clear.',
    anonymous: false,
  });
  assert.equal(normalizeAppointmentReviewInput(0, 'No', false), null);
  assert.equal(normalizeAppointmentReviewInput(4.5, 'No', false), null);
  assert.equal(normalizeAppointmentReviewInput(4, 'x'.repeat(1201), false), null);
  assert.equal(patientReviewAlias('Riya Sharma', false), 'Riya S.');
  assert.equal(patientReviewAlias('Riya Sharma', true), 'Verified patient');
});

test('projects only published patient-safe review fields', () => {
  const pending = toPublicAppointmentReviewDto({
    id: 'review_123', clinicId: 'clinic-1', rating: 5, moderationStatus: 'pending',
  });
  assert.equal(pending, null);

  const published = toPublicAppointmentReviewDto({
    id: 'review_123',
    clinicId: 'clinic-1',
    rating: 5,
    text: 'Thoughtful care.',
    patientAlias: 'Riya S.',
    moderationStatus: 'published',
    publishedAt: new Date('2026-09-02T10:00:00Z'),
    clinicResponse: 'Thank you for your feedback.',
    clinicRespondedAt: new Date('2026-09-03T10:00:00Z'),
    patientUid: 'must-not-leak',
    appointmentId: 'must-not-leak',
    moderationNotes: 'must-not-leak',
  });
  assert.deepEqual(published, {
    id: 'review_123',
    clinicId: 'clinic-1',
    rating: 5,
    text: 'Thoughtful care.',
    patientAlias: 'Riya S.',
    publishedAt: '2026-09-02T10:00:00.000Z',
    clinicResponse: 'Thank you for your feedback.',
    clinicRespondedAt: '2026-09-03T10:00:00.000Z',
  });
});

test('validates reports and clinic responses within bounded fields', () => {
  assert.deepEqual(normalizeAppointmentReviewReport('privacy', 'Contains my surname.'), {
    reason: 'privacy',
    details: 'Contains my surname.',
  });
  assert.equal(normalizeAppointmentReviewReport('unknown', ''), null);
  assert.equal(normalizeAppointmentReviewReport('other', 'x'.repeat(501)), null);
  assert.equal(normalizeClinicReviewResponse(' Thank you. '), 'Thank you.');
  assert.equal(normalizeClinicReviewResponse('x'), null);
});

test('returns bounded moderation state to the verified review owner', () => {
  assert.deepEqual(toPatientAppointmentReviewDto({
    id: 'review_123',
    clinicId: 'clinic-1',
    rating: 4,
    text: 'Clear explanation.',
    patientAlias: 'Verified patient',
    moderationStatus: 'pending',
    createdAt: new Date('2026-09-02T10:00:00Z'),
    patientUid: 'must-not-leak',
    appointmentId: 'must-not-leak',
  }), {
    id: 'review_123',
    clinicId: 'clinic-1',
    rating: 4,
    text: 'Clear explanation.',
    patientAlias: 'Verified patient',
    moderationStatus: 'pending',
    createdAt: '2026-09-02T10:00:00.000Z',
    publishedAt: null,
    clinicResponse: '',
    clinicRespondedAt: null,
  });
});