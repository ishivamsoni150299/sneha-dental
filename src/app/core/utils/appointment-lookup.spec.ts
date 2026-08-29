import {
  buildAppointmentLookupKey,
  buildLegacyAppointmentLookupKey,
} from './appointment-lookup';

describe('appointment lookup keys', () => {
  it('creates a stable 64-character SHA-256 document id', async () => {
    const first = await buildAppointmentLookupKey('clinic-1', 'BK-Ab12', '+91 99999 88888');
    const second = await buildAppointmentLookupKey('clinic-1', 'bk-ab12', '9999988888');

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toBe(first);
  });

  it('does not expose the booking reference or phone number', async () => {
    const key = await buildAppointmentLookupKey('clinic-1', 'BK-SECRET1', '9999988888');

    expect(key).not.toContain('SECRET1');
    expect(key).not.toContain('9999988888');
  });

  it('keeps the legacy key available for existing appointment lookups', () => {
    expect(buildLegacyAppointmentLookupKey('clinic-1', ' bk-ab12 ', '+91 99999 88888'))
      .toBe('clinic-1__BK-AB12__9999988888');
  });
});
