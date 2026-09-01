import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceCallStatus,
  deriveCallOutcome,
  latestCallAttemptAt,
  mapProviderCallStatus,
  normalizeIndianPhone,
  providerEventMatchesCall,
  queuePolicyBlockReason,
  validateCallSchedule,
} from '../../api/_lib/lead-ai-call-policy.ts';

test('normalizes supported Indian mobile and landline formats', () => {
  assert.equal(normalizeIndianPhone('91402 10648'), '+919140210648');
  assert.equal(normalizeIndianPhone('+91 91402 10648'), '+919140210648');
  assert.equal(normalizeIndianPhone('040 2345 6789'), '+914023456789');
  assert.equal(normalizeIndianPhone('12345'), '');
});

test('enforces the India calling window and schedule horizon', () => {
  const now = Date.parse('2026-03-16T03:00:00.000Z');
  assert.equal(validateCallSchedule('2026-03-16T05:00:00.000Z', now).ok, true);
  assert.match(validateCallSchedule('2026-03-22T05:00:00.000Z', now).error ?? '', /Monday-Saturday/);
  assert.match(validateCallSchedule('2026-03-16T03:10:00.000Z', now).error ?? '', /9:00 AM/);
  assert.match(validateCallSchedule('2026-03-16T03:05:00.000Z', now).error ?? '', /10 minutes/);
  assert.equal(latestCallAttemptAt(new Date('2026-03-16T05:00:00.000Z')), '2026-03-16T05:15:00.000Z');
  assert.equal(latestCallAttemptAt(new Date('2026-03-16T13:29:00.000Z')), '2026-03-16T13:29:59.999Z');
});

test('blocks opt-outs, active calls, attempts, and cooldown violations', () => {
  const scheduled = Date.parse('2026-03-17T06:00:00.000Z');
  assert.match(queuePolicyBlockReason({ doNotCall: true }, scheduled), /do not call/);
  assert.match(queuePolicyBlockReason({ aiCallStatus: 'queued' }, scheduled), /active AI call/);
  assert.match(queuePolicyBlockReason({ aiCallAttempts: 3 }, scheduled), /3-call/);
  assert.match(queuePolicyBlockReason({ aiCallLastAttemptAt: '2026-03-16T12:00:00.000Z' }, scheduled), /24 hours/);
  assert.equal(queuePolicyBlockReason({ aiCallAttempts: 1 }, scheduled), '');
});

test('maps provider events and conservative call outcomes', () => {
  assert.equal(mapProviderCallStatus('in-progress'), 'in_progress');
  assert.equal(mapProviderCallStatus('ended'), 'completed');
  assert.equal(advanceCallStatus('ringing', 'queued'), 'ringing');
  assert.equal(advanceCallStatus('queued', 'in_progress'), 'in_progress');
  assert.equal(advanceCallStatus('cancelled', 'completed'), 'cancelled');
  assert.equal(advanceCallStatus('failed', 'completed'), 'failed');
  assert.equal(advanceCallStatus('opted_out', 'completed'), 'opted_out');
  assert.equal(providerEventMatchesCall('call-new', 'request-new', 'call-new', ''), true);
  assert.equal(providerEventMatchesCall('', 'request-new', 'call-new', 'request-new'), true);
  assert.equal(providerEventMatchesCall('call-new', 'request-new', 'call-old', 'request-old'), false);
  assert.equal(providerEventMatchesCall(undefined, undefined, 'call-old', 'request-old'), false);
  assert.equal(deriveCallOutcome('appointment-booked', '', ''), 'demo_booked');
  assert.equal(deriveCallOutcome('', '', 'Assistant: You may stop at any time.\nUser: Please do not call me again.'), 'opted_out');
  assert.equal(deriveCallOutcome('', '', 'Assistant: You can ask me to stop calling.'), 'unknown');
  assert.equal(deriveCallOutcome('', 'customer-did-not-answer', ''), 'no_answer');
  assert.equal(deriveCallOutcome('', 'twilio-reported-customer-misdialed', ''), 'wrong_number');
});