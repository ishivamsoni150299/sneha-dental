import { maskPatientPhone, normalizePatientPhone } from './patient-auth.service';

describe('PatientAuthService phone helpers', () => {
  it('normalizes supported Indian mobile formats', () => {
    expect(normalizePatientPhone('98765 43210')).toBe('+919876543210');
    expect(normalizePatientPhone('+91 98765 43210')).toBe('+919876543210');
    expect(normalizePatientPhone('12345')).toBeNull();
  });

  it('masks a verified phone for patient-facing copy', () => {
    expect(maskPatientPhone('+919876543210')).toBe('+91 ••••••3210');
  });
});