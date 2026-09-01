import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import type { User } from 'firebase/auth';
import { of } from 'rxjs';
import { AuthFacade, type AuthRole } from '../../../core/services/auth-facade.service';
import { VerifyEmailComponent } from './verify-email.component';

describe('VerifyEmailComponent', () => {
  let router: jasmine.SpyObj<Router>;
  let auth: {
    authReady: Promise<void>;
    currentUser: () => User | null;
    role: () => AuthRole | null;
    refreshVerificationStatus: jasmine.Spy;
    resendVerificationEmail: jasmine.Spy;
    logout: jasmine.Spy;
  };

  function create(options: {
    user?: User | null;
    role?: AuthRole | null;
    returnUrl?: string | null;
  } = {}): VerifyEmailComponent {
    router = jasmine.createSpyObj(
      'Router',
      ['navigate', 'navigateByUrl', 'createUrlTree', 'serializeUrl'],
      { events: of() },
    );
    router.navigate.and.resolveTo(true);
    router.navigateByUrl.and.resolveTo(true);
    router.createUrlTree.and.returnValue({} as never);
    router.serializeUrl.and.returnValue('/');

    const user = options.user === undefined
      ? ({ uid: 'owner-1', email: 'owner@example.com' } as User)
      : options.user;
    auth = {
      authReady: Promise.resolve(),
      currentUser: () => user,
      role: () => options.role ?? 'unverified',
      refreshVerificationStatus: jasmine.createSpy('refreshVerificationStatus'),
      resendVerificationEmail: jasmine.createSpy('resendVerificationEmail'),
      logout: jasmine.createSpy('logout').and.resolveTo(),
    };

    TestBed.configureTestingModule({
      imports: [VerifyEmailComponent],
      providers: [
        { provide: AuthFacade, useValue: auth },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: {
                get: (key: string) => key === 'returnUrl' ? (options.returnUrl ?? null) : null,
              },
            },
          },
        },
      ],
    });

    return TestBed.createComponent(VerifyEmailComponent).componentInstance;
  }

  it('returns an expired session to sign in', async () => {
    const component = create({ user: null, role: null });

    await component.ngOnInit();

    expect(router.navigate).toHaveBeenCalledWith(['/business/login'], {
      queryParams: undefined,
      replaceUrl: true,
    });
  });

  it('continues a verified clinic owner to the requested clinic page', async () => {
    const component = create({
      role: 'clinic-admin',
      returnUrl: '/business/clinic/patients',
    });

    await component.ngOnInit();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/business/clinic/patients', { replaceUrl: true });
  });

  it('returns a patient session to the appointment hub', async () => {
    const component = create({ role: 'patient' });

    await component.ngOnInit();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/appointments', { replaceUrl: true });
  });

  it('resumes onboarding after verification when no clinic exists', async () => {
    const component = create();
    auth.refreshVerificationStatus.and.resolveTo('incomplete-signup');

    await component.checkVerification();

    expect(router.navigate).toHaveBeenCalledWith(['/business/signup'], {
      queryParams: { resume: 'true' },
      replaceUrl: true,
    });
  });

  it('shows a specific message when verification resends are throttled', async () => {
    const component = create();
    auth.resendVerificationEmail.and.rejectWith({ code: 'auth/too-many-requests' });

    await component.resend();

    expect(component.error()).toContain('Too many requests');
    expect(component.resending()).toBeFalse();
  });
});
