import { TestBed } from '@angular/core/testing';
import { AuthFacade, type PlatformUser } from './auth-facade.service';

describe('AuthFacade', () => {
  let service: AuthFacade;
  let fetchSpy: jasmine.Spy;

  beforeEach(async () => {
    fetchSpy = spyOn(globalThis, 'fetch').and.resolveTo(new Response(
      JSON.stringify({ code: 'invalid_credentials' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    ));
    TestBed.configureTestingModule({});
    service = TestBed.inject(AuthFacade);
    await service.authReady;
  });

  it('represents an unauthenticated session', () => {
    service.currentUser.set(null);
    service.role.set(null);
    expect(service.currentUser()).toBeNull();
    expect(service.role()).toBeNull();
    expect(service.isAuthenticated).toBeFalse();
  });

  it('derives authentication from the current user signal', () => {
    service.currentUser.set({ uid: 'clinic-owner' } as PlatformUser);
    expect(service.isAuthenticated).toBeTrue();

    service.currentUser.set(null);
    expect(service.isAuthenticated).toBeFalse();
  });

  it('represents clinic and platform roles independently from identity', () => {
    service.currentUser.set({ uid: 'authorised-user' } as PlatformUser);

    service.role.set('clinic-admin');
    expect(service.role()).toBe('clinic-admin');

    service.role.set('platform-admin');
    expect(service.role()).toBe('platform-admin');
  });

  it('creates a Spring session from the clinic login response', async () => {
    fetchSpy.and.resolveTo(new Response(JSON.stringify({
      accessToken: 'access-token',
      expiresIn: 900,
      user: {
        id: 'clinic-owner',
        clinicId: 'clinic-1',
        role: 'clinic-admin',
        email: 'owner@example.com',
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    expect(await service.signInWithEmail('owner@example.com', 'password')).toBe('clinic-admin');
    expect(service.currentUser()?.uid).toBe('clinic-owner');
    expect(service.currentUser()?.clinicId).toBe('clinic-1');
    expect(service.isAuthenticated).toBeTrue();
  });
});