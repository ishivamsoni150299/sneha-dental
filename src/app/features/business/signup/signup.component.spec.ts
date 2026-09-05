import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { AuthFacade, type AuthRole, type PlatformUser } from '../../../core/services/auth-facade.service';
import { SignupComponent } from './signup.component';

describe('SignupComponent', () => {
  let router: jasmine.SpyObj<Router>;
  let createAccountWithGoogle: jasmine.Spy;

  function create(role: AuthRole): SignupComponent {
    router = jasmine.createSpyObj(
      'Router',
      ['navigate', 'createUrlTree', 'serializeUrl'],
      { events: of() },
    );
    router.navigate.and.resolveTo(true);
    router.createUrlTree.and.returnValue({} as never);
    router.serializeUrl.and.returnValue('/');
    createAccountWithGoogle = jasmine.createSpy('createAccountWithGoogle').and.resolveTo({
      user: { uid: 'user-1', email: 'owner@example.com' } as PlatformUser,
      role,
    });

    TestBed.configureTestingModule({
      imports: [SignupComponent],
      providers: [
        {
          provide: AuthFacade,
          useValue: {
            authReady: Promise.resolve(),
            currentUser: () => null,
            role: () => null,
            createAccountWithGoogle,
          },
        },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: { get: () => null },
            },
          },
        },
      ],
    });

    return TestBed.createComponent(SignupComponent).componentInstance;
  }

  it('routes an existing clinic owner to the dashboard', async () => {
    const component = create('clinic-admin');

    await component.createAccountWithGoogle();

    expect(router.navigate).toHaveBeenCalledWith(['/business/clinic/dashboard']);
    expect(component.step()).toBe(0);
  });

  it('keeps a patient identity out of clinic onboarding', async () => {
    const component = create('patient');

    await component.createAccountWithGoogle();

    expect(router.navigate).toHaveBeenCalledWith(['/appointments']);
    expect(component.step()).toBe(0);
  });

  it('routes an unverified identity to email verification', async () => {
    const component = create('unverified');

    await component.createAccountWithGoogle();

    expect(router.navigate).toHaveBeenCalledWith(['/business/verify-email'], { replaceUrl: true });
    expect(component.step()).toBe(0);
  });

  it('starts onboarding only for an identity without a workspace', async () => {
    const component = create('incomplete-signup');

    await component.createAccountWithGoogle();

    expect(router.navigate).not.toHaveBeenCalled();
    expect(component.step()).toBe(1);
  });
});