import { TestBed } from '@angular/core/testing';
import type { User } from 'firebase/auth';
import { AuthFacade } from './auth-facade.service';

describe('AuthFacade', () => {
  let service: AuthFacade;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AuthFacade);
  });

  it('represents an unauthenticated session', () => {
    service.currentUser.set(null);
    service.role.set(null);
    expect(service.currentUser()).toBeNull();
    expect(service.role()).toBeNull();
    expect(service.isAuthenticated).toBeFalse();
  });

  it('derives authentication from the current user signal', () => {
    service.currentUser.set({ uid: 'clinic-owner' } as User);
    expect(service.isAuthenticated).toBeTrue();

    service.currentUser.set(null);
    expect(service.isAuthenticated).toBeFalse();
  });

  it('represents clinic and platform roles independently from identity', () => {
    service.currentUser.set({ uid: 'authorised-user' } as User);

    service.role.set('clinic-admin');
    expect(service.role()).toBe('clinic-admin');

    service.role.set('platform-admin');
    expect(service.role()).toBe('platform-admin');
  });

  it('requires verification regardless of the sign-in provider', async () => {
    const user = {
      uid: 'unverified-user',
      emailVerified: false,
      providerData: [{ providerId: 'google.com' }],
    } as User;

    const role = await service['resolveUser'](user);

    expect(role).toBe('unverified');
  });

  it('does not apply a role resolved for a stale auth revision', async () => {
    const user = {
      uid: 'stale-user',
      emailVerified: false,
      providerData: [],
    } as unknown as User;

    const role = await service['resolveUser'](user, 999);

    expect(role).toBe('unverified');
    expect(service.currentUser()).toBeNull();
    expect(service.role()).toBeNull();
  });
});