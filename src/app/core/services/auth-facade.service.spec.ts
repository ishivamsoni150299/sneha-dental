import { TestBed } from '@angular/core/testing';
import type { User } from 'firebase/auth';
import { AuthFacade } from './auth-facade.service';

describe('AuthFacade', () => {
  let service: AuthFacade;

  beforeEach(async () => {
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

  it('requires email verification for non-patient sign-in providers', async () => {
    const user = {
      uid: 'unverified-user',
      emailVerified: false,
      providerData: [{ providerId: 'google.com' }],
    } as User;

    const role = await service['resolveUser'](user);

    expect(role).toBe('unverified');
  });

  it('recognizes a phone-only Firebase identity as a patient', async () => {
    const user = {
      uid: 'patient-user',
      email: null,
      emailVerified: false,
      phoneNumber: '+919876543210',
      providerData: [{ providerId: 'phone' }],
    } as User;

    const role = await service['resolveUser'](user);

    expect(role).toBe('patient');
    expect(service.currentUser()).toBe(user);
  });

  it('does not replace clinic email verification with a linked phone provider', async () => {
    const user = {
      uid: 'clinic-user',
      email: 'owner@example.com',
      emailVerified: false,
      phoneNumber: '+919876543210',
      providerData: [{ providerId: 'password' }, { providerId: 'phone' }],
    } as User;

    expect(await service['resolveUser'](user)).toBe('unverified');
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