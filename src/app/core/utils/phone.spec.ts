import { phoneDigits, phoneHref } from './phone';

describe('Contact phone formatting', () => {
  it('preserves explicit international country codes', () => {
    expect(phoneDigits('+1 (202) 555-0123')).toBe('12025550123');
    expect(phoneHref('+1 (202) 555-0123')).toBe('tel:+12025550123');
    expect(phoneDigits('0044 20 7946 0958')).toBe('442079460958');
  });

  it('adds the default country code only to local ten-digit numbers', () => {
    expect(phoneDigits('9876543210')).toBe('919876543210');
    expect(phoneDigits('919876543210')).toBe('919876543210');
  });

  it('does not duplicate plus signs or produce empty telephone links', () => {
    expect(phoneHref('+919876543210')).toBe('tel:+919876543210');
    expect(phoneHref('')).toBe('');
  });
});