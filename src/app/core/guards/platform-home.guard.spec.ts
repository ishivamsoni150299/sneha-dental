import { isPlatformHomeHost } from './platform-home.guard';

describe('platform home routing', () => {
  it('opens Mili on platform, Render and development hosts', () => {
    for (const host of ['mydentalplatform.com', 'www.mydentalplatform.com', 'mydentalplatform.onrender.com', 'localhost', '127.0.0.1']) {
      expect(isPlatformHomeHost(host)).toBeTrue();
    }
  });
  it('preserves branded clinic hosts', () => {
    for (const host of ['smile.mydentalplatform.com', 'www.clinic.example', 'mydentalplatform.com.example']) {
      expect(isPlatformHomeHost(host)).toBeFalse();
    }
  });
});
