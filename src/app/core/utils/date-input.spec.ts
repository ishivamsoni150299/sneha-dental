import { appointmentDayLabel, formatDateInTimeZone, formatLocalDateInput } from './date-input';

describe('formatLocalDateInput', () => {
  it('uses local date parts instead of the UTC calendar day', () => {
    const earlyLocalTime = new Date('2026-08-29T18:45:00.000Z');
    spyOn(earlyLocalTime, 'getFullYear').and.returnValue(2026);
    spyOn(earlyLocalTime, 'getMonth').and.returnValue(7);
    spyOn(earlyLocalTime, 'getDate').and.returnValue(30);

    expect(formatLocalDateInput(earlyLocalTime)).toBe('2026-08-30');
  });

  it('pads single-digit months and days', () => {
    const localDate = new Date(2026, 0, 2, 8, 0);

    expect(formatLocalDateInput(localDate)).toBe('2026-01-02');
  });
});

describe('appointment dates in the practice timezone', () => {
  it('uses the India calendar day across midnight and month boundaries', () => {
    const now = new Date('2026-12-31T20:00:00Z');
    expect(formatDateInTimeZone(now)).toBe('2027-01-01');
    expect(appointmentDayLabel('2027-01-01', 'Asia/Kolkata', now)).toBe('Today');
    expect(appointmentDayLabel('2027-01-02', 'Asia/Kolkata', now)).toBe('Tomorrow');
    expect(appointmentDayLabel('2027-01-03', 'Asia/Kolkata', now)).toContain('3');
  });
});
