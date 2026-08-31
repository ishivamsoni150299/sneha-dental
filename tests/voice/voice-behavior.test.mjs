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
import {
  normalizeRealtimeBookingUpdate,
  submitRealtimeBookingRequest,
} from '../../src/app/shared/components/voice-agent/voice-booking-status.ts';

const futureYear = String(new Date().getUTCFullYear() + 2);
const preferredDate = `${futureYear}-06-15`;

class FakeSnapshot {
  constructor(id, value) {
    this.id = id;
    this.value = value;
  }

  get exists() { return this.value !== undefined; }
  data() { return this.value; }
}

class FakeDocumentReference {
  constructor(database, collectionName, id) {
    this.database = database;
    this.collectionName = collectionName;
    this.id = id;
  }

  async get() {
    return new FakeSnapshot(this.id, this.database.read(this.collectionName, this.id));
  }
}

class FakeQuery {
  constructor(database, collectionName, filters = [], limitValue = Infinity) {
    this.database = database;
    this.collectionName = collectionName;
    this.filters = filters;
    this.limitValue = limitValue;
  }

  where(field, operator, value) {
    assert.equal(operator, '==');
    return new FakeQuery(this.database, this.collectionName, [...this.filters, { field, value }], this.limitValue);
  }

  limit(value) {
    return new FakeQuery(this.database, this.collectionName, this.filters, value);
  }

  async get() {
    const docs = this.database.entries(this.collectionName)
      .filter(([, value]) => this.filters.every(filter => value[filter.field] === filter.value))
      .slice(0, this.limitValue)
      .map(([id, value]) => new FakeSnapshot(id, value));
    return { docs };
  }
}

class FakeCollection extends FakeQuery {
  doc(id) {
    return new FakeDocumentReference(this.database, this.collectionName, id);
  }
}

class FakeFirestore {
  constructor() {
    this.collections = new Map();
    this.failTransaction = false;
  }

  collection(name) {
    return new FakeCollection(this, name);
  }

  seed(collectionName, id, value) {
    this.getCollection(collectionName).set(id, value);
  }

  read(collectionName, id) {
    return this.getCollection(collectionName).get(id);
  }

  entries(collectionName) {
    return [...this.getCollection(collectionName).entries()];
  }

  async runTransaction(callback) {
    if (this.failTransaction) throw new Error('SIMULATED_WRITE_FAILURE');
    const pending = [];
    const transaction = {
      get: reference => reference.get(),
      set: (reference, value) => pending.push({ reference, value }),
    };
    const result = await callback(transaction);
    for (const { reference, value } of pending) {
      this.seed(reference.collectionName, reference.id, value);
    }
    return result;
  }

  getCollection(name) {
    if (!this.collections.has(name)) this.collections.set(name, new Map());
    return this.collections.get(name);
  }
}

function completeBooking(overrides = {}) {
  return {
    clinicId: 'clinic-demo',
    bookingRefPrefix: 'TEST',
    name: 'Test Patient',
    phone: '98765 43210',
    service: 'Dental consultation',
    preferredDate,
    preferredTime: '10:30',
    ...overrides,
  };
}

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

test('creates a normalized appointment and reserves its requested slot', async () => {
  const db = new FakeFirestore();
  const result = await createVoiceBookingRequest(db, completeBooking());

  assert.equal(result.ok, true);
  assert.equal(result.bookingCreated, true);
  assert.match(result.bookingRef, /^TEST-[A-Z0-9]{8}$/);

  const appointments = db.entries('appointments');
  assert.equal(appointments.length, 1);
  assert.deepEqual(appointments[0][1], {
    ...appointments[0][1],
    clinicId: 'clinic-demo',
    bookingRef: result.bookingRef,
    name: 'Test Patient',
    phone: '+919876543210',
    service: 'Dental consultation',
    date: preferredDate,
    time: '10:30',
    status: 'pending',
    source: 'voice',
  });
  assert.equal(db.entries('slots').length, 1);
});

test('returns the existing reference for a repeated request to the same slot', async () => {
  const db = new FakeFirestore();
  db.seed('appointments', 'existing-booking', {
    clinicId: 'clinic-demo',
    phone: '+919876543210',
    date: preferredDate,
    time: '10:30',
    bookingRef: 'TEST-EXISTING',
    createdAt: { toDate: () => new Date() },
  });

  const result = await createVoiceBookingRequest(db, completeBooking());

  assert.equal(result.ok, true);
  assert.equal(result.bookingCreated, false);
  assert.equal(result.code, 'duplicate_recent');
  assert.equal(result.bookingRef, 'TEST-EXISTING');
  assert.equal(db.entries('appointments').length, 1);
});

test('allows the same patient to request a different appointment time', async () => {
  const db = new FakeFirestore();
  db.seed('appointments', 'existing-booking', {
    clinicId: 'clinic-demo',
    phone: '+919876543210',
    date: preferredDate,
    time: '10:30',
    bookingRef: 'TEST-EXISTING',
    createdAt: { toDate: () => new Date() },
  });

  const result = await createVoiceBookingRequest(db, completeBooking({ preferredTime: '11:30' }));

  assert.equal(result.ok, true);
  assert.equal(result.bookingCreated, true);
  assert.equal(db.entries('appointments').length, 2);
});

test('reports a reserved slot and a failed write without claiming success', async () => {
  const slotDb = new FakeFirestore();
  slotDb.seed('slots', `clinic-demo_any_${preferredDate}_1030`, { appointmentId: 'another-booking' });
  const slotResult = await createVoiceBookingRequest(slotDb, completeBooking());
  assert.equal(slotResult.ok, false);
  assert.equal(slotResult.code, 'slot_taken');
  assert.equal(slotResult.bookingCreated, false);

  const failingDb = new FakeFirestore();
  failingDb.failTransaction = true;
  const originalConsoleError = console.error;
  console.error = () => undefined;
  const failedResult = await createVoiceBookingRequest(failingDb, completeBooking())
    .finally(() => { console.error = originalConsoleError; });
  assert.equal(failedResult.ok, false);
  assert.equal(failedResult.code, 'write_failed');
  assert.equal(failedResult.bookingCreated, false);
});

test('maps voice booking responses to patient-visible UI states', () => {
  assert.deepEqual(normalizeRealtimeBookingUpdate({
    success: true,
    booking_created: true,
    booking_ref: 'TEST-ABC12345',
    message: 'Request received.',
  }), {
    phase: 'confirmed',
    bookingRef: 'TEST-ABC12345',
    message: 'Request received.',
  });

  assert.equal(normalizeRealtimeBookingUpdate({ success: false, code: 'missing_fields' }).phase, 'needs-details');
  assert.equal(normalizeRealtimeBookingUpdate({ success: false, code: 'slot_taken' }).phase, 'slot-taken');
  assert.equal(normalizeRealtimeBookingUpdate({ success: false, code: 'write_failed' }).phase, 'failed');
});

test('submits the realtime booking with clinic-bound session credentials', async () => {
  const requests = [];
  const request = async (url, init) => {
    requests.push({ url, init });
    return {
      ok: true,
      async json() {
        return {
          success: true,
          booking_created: true,
          booking_ref: 'TEST-ABC12345',
          message: 'Appointment request received.',
        };
      },
    };
  };

  const submission = await submitRealtimeBookingRequest(
    'clinic-demo',
    'signed-session-token',
    { name: 'Test Patient', phone: '9876543210', preferredTime: '10:30' },
    request,
  );

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/voice-booking-action');
  assert.equal(requests[0].init.method, 'POST');
  assert.equal(requests[0].init.headers['X-Voice-Session-Token'], 'signed-session-token');
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    name: 'Test Patient',
    phone: '9876543210',
    preferredTime: '10:30',
    clinicId: 'clinic-demo',
  });
  assert.equal(submission.update.phase, 'confirmed');
  assert.equal(submission.update.bookingRef, 'TEST-ABC12345');

  const unavailable = await submitRealtimeBookingRequest(
    'clinic-demo',
    'signed-session-token',
    {},
    async () => { throw new Error('offline'); },
  );
  assert.equal(unavailable.update.phase, 'failed');
  assert.match(unavailable.update.message, /temporarily unavailable/i);
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
