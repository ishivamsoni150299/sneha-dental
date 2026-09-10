import { generateSlots } from './doctor.service';

describe('Doctor appointment durations', () => {
  it('offers only appointments that fit fully before closing', () => {
    expect(generateSlots('09:00', '10:15')).toEqual(['09:00', '09:30']);
    expect(generateSlots('23:00', '23:59')).toEqual(['23:00']);
  });
  it('does not offer slots for reversed or too-short working hours', () => {
    expect(generateSlots('17:00', '09:00')).toEqual([]);
    expect(generateSlots('09:00', '09:15')).toEqual([]);
  });
});
