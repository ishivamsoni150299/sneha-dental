import { generateSlots, normalizeTimeValue } from './doctor.service';

describe('Doctor appointment durations', () => {
  it('normalizes API LocalTime values before comparing them with form slots', () => {
    expect(normalizeTimeValue('09:30:00')).toBe('09:30');
    expect(normalizeTimeValue('09:30:00.000')).toBe('09:30');
    expect(normalizeTimeValue('9:30 AM')).toBe('09:30');
    expect(normalizeTimeValue('09:30:15')).toBe('09:30:15');
  });
  it('offers only appointments that fit fully before closing', () => {
    expect(generateSlots('09:00', '10:15')).toEqual(['09:00', '09:30']);
    expect(generateSlots('23:00', '23:59')).toEqual(['23:00']);
  });
  it('does not offer slots for reversed or too-short working hours', () => {
    expect(generateSlots('17:00', '09:00')).toEqual([]);
    expect(generateSlots('09:00', '09:15')).toEqual([]);
  });
});
