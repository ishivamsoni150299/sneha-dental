import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAgentSystemPrompt,
  normalizeOpenAIVoice,
  resolveVoiceAgentSettings,
} from '../../api/_lib/voice-agent-config.ts';
import {
  createVoiceBookingRequest,
  normalizePreferredDate,
  normalizePreferredTime,
} from '../../api/_lib/voice-booking-action.ts';

const futureYear = String(new Date().getUTCFullYear() + 2);

test('normalizes valid booking dates and rejects impossible or past dates', () => {
  assert.equal(normalizePreferredDate(`${futureYear}-6-15`), `${futureYear}-06-15`);
  assert.equal(normalizePreferredDate(`${futureYear}-02-30`), '');
  assert.equal(normalizePreferredDate('2000-01-01'), '');
});

test('normalizes valid booking times and rejects invalid values', () => {
  assert.equal(normalizePreferredTime('2:30 pm'), '14:30');
  assert.equal(normalizePreferredTime('09:05'), '09:05');
  assert.equal(normalizePreferredTime('13 pm'), '');
  assert.equal(normalizePreferredTime('25:90'), '');
});

test('treats an unusable phone number as a missing booking field', async () => {
  const result = await createVoiceBookingRequest({}, {
    clinicId: 'clinic-demo',
    name: 'Test Patient',
    phone: '123',
    service: 'Dental consultation',
    preferredDate: `${futureYear}-06-15`,
    preferredTime: '10:30',
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'missing_fields');
  assert.ok(result.missingFields?.includes('phone number'));
});

test('builds a clinic-specific prompt with safety and confirmation rules', () => {
  const prompt = buildAgentSystemPrompt({
    name: 'Demo Dental',
    doctorName: 'Dr Test',
    city: 'Pune',
    phone: '+919876543210',
    voiceAgentPersona: 'Use a calm and formal tone.',
    services: [{ name: 'Cleaning', price: 'Rs 800' }],
  }, { voiceActionEnabled: true });

  assert.match(prompt, /Demo Dental/);
  assert.match(prompt, /Cleaning \(Rs 800\)/);
  assert.match(prompt, /Do not give medical advice/);
  assert.match(prompt, /explicit patient confirmation|wait for a clear yes/i);
  assert.match(prompt, /submit_voice_booking_request/);
  assert.ok(prompt.indexOf('Use a calm and formal tone.') < prompt.indexOf('STRICT BOUNDARIES:'));
});

test('uses a supported OpenAI voice and bilingual clinic greeting by default', () => {
  assert.equal(normalizeOpenAIVoice('unknown'), 'marin');
  const settings = resolveVoiceAgentSettings({ name: 'Demo Dental' });
  assert.equal(settings.voice, 'marin');
  assert.equal(settings.language, 'bilingual');
  assert.match(settings.greeting, /Demo Dental/);
});
