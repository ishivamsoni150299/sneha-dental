import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createVoiceSessionToken,
  verifyVoiceSessionToken,
} from '../../api/_lib/voice-session-auth.ts';

const secret = 'test-only-signing-secret-with-sufficient-entropy';
const capability = {
  clinicId: 'clinic-demo',
  sessionId: '123e4567-e89b-12d3-a456-426614174000',
  expiresAt: 2_000_000,
};

test('round-trips a valid voice session capability', () => {
  const token = createVoiceSessionToken(capability, secret);
  assert.deepEqual(verifyVoiceSessionToken(token, secret, 1_000_000), capability);
});

test('rejects an expired capability', () => {
  const token = createVoiceSessionToken(capability, secret);
  assert.equal(verifyVoiceSessionToken(token, secret, capability.expiresAt), null);
});

test('rejects a wrong secret or modified signature', () => {
  const token = createVoiceSessionToken(capability, secret);
  const replacement = token.endsWith('a') ? 'b' : 'a';
  const tampered = `${token.slice(0, -1)}${replacement}`;

  assert.equal(verifyVoiceSessionToken(token, 'different-secret', 1_000_000), null);
  assert.equal(verifyVoiceSessionToken(tampered, secret, 1_000_000), null);
});

test('rejects malformed capability fields', () => {
  const malformed = createVoiceSessionToken({
    ...capability,
    sessionId: 'not-a-uuid',
  }, secret);

  assert.equal(verifyVoiceSessionToken(malformed, secret, 1_000_000), null);
  assert.equal(verifyVoiceSessionToken('invalid', secret, 1_000_000), null);
  assert.equal(verifyVoiceSessionToken(malformed, '', 1_000_000), null);
});
