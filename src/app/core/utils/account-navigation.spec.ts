import { accountDestination } from './account-navigation';

describe('accountDestination', () => {
  it('opens the workspace belonging to each role', () => {
    expect(accountDestination('patient')).toBe('/appointments');
    expect(accountDestination('dentist')).toBe('/professional/workspace');
    expect(accountDestination('clinic-admin')).toBe('/business/clinic/dashboard');
    expect(accountDestination('platform-admin')).toBe('/business/clinics');
    expect(accountDestination('incomplete-signup')).toBe('/business/signup?resume=true');
  });
  it('preserves patient booking and secure claim context', () => {
    for (const url of ['/appointments?claim=DEMO-12345678', '/dentists/example/book?mode=video&date=2026-10-01&time=10:00']) {
      expect(accountDestination('patient', url)).toBe(url);
    }
  });
  it('preserves clinic setup attribution only for incomplete accounts', () => {
    const url = '/business/signup?plan=starter&utm_source=test';
    expect(accountDestination('incomplete-signup', url)).toBe(url);
    expect(accountDestination('patient', url)).toBe('/appointments');
  });
  it('rejects external, encoded, login-loop and other-role destinations', () => {
    for (const url of ['https://example.com', '//example.com', '/\\example.com', '/%2fexample.com', '/account', '/professional/workspace', '/business/clinics']) {
      expect(accountDestination('patient', url)).toBe('/appointments');
    }
    expect(accountDestination('clinic-admin', '/business/clinics')).toBe('/business/clinic/dashboard');
    expect(accountDestination('dentist', '/appointments')).toBe('/professional/workspace');
  });
});
