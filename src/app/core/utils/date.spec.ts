import { formatIndiaDate } from './date';

describe('India-local operational dates', () => {
  it('formats full ISO enquiry timestamps without appending another midnight', () => {
    expect(formatIndiaDate('2026-10-02T02:04:16.647347Z')).toBe('2 Oct 2026');
  });

  it('preserves an India-local preferred date across the UTC day boundary', () => {
    expect(formatIndiaDate('2026-10-04T18:30:00.000Z')).toBe('5 Oct 2026');
    expect(formatIndiaDate('2026-10-05')).toBe('5 Oct 2026');
  });

  it('uses a neutral fallback for absent or invalid dates', () => {
    expect(formatIndiaDate('')).toBe('-');
    expect(formatIndiaDate('invalid')).toBe('-');
  });
});