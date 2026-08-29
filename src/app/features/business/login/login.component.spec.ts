import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { AuthFacade, type AuthRole } from '../../../core/services/auth-facade.service';
import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
  let router: jasmine.SpyObj<Router>;
  let auth: {
    authReady: Promise<void>;
    role: () => AuthRole | null;
    signInWithEmail: jasmine.Spy;
    signInWithGoogle: jasmine.Spy;
    logout: jasmine.Spy;
  };

  function create(
    portal: 'clinic' | 'platform',
    returnUrl: string | null = null,
    initialRole: AuthRole | null = null,
  ): LoginComponent {
    router = jasmine.createSpyObj(
      'Router',
      ['navigate', 'navigateByUrl', 'createUrlTree', 'serializeUrl'],
      { events: of() },
    );
    router.navigate.and.resolveTo(true);
    router.navigateByUrl.and.resolveTo(true);
    router.createUrlTree.and.returnValue({} as never);
    router.serializeUrl.and.returnValue('/');
    auth = {
      authReady: Promise.resolve(),
      role: () => initialRole,
      signInWithEmail: jasmine.createSpy('signInWithEmail'),
      signInWithGoogle: jasmine.createSpy('signInWithGoogle'),
      logout: jasmine.createSpy('logout').and.resolveTo(),
    };
    TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        { provide: AuthFacade, useValue: auth },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              data: { portal },
              queryParamMap: { get: (key: string) => key === 'returnUrl' ? returnUrl : null },
            },
          },
        },
      ],
    });
    return TestBed.createComponent(LoginComponent).componentInstance;
  }

  it('returns a clinic owner to the originally requested clinic page', async () => {
    const component = create('clinic', '/business/clinic/patients');
    auth.signInWithEmail.and.resolveTo('clinic-admin');
    component.form.setValue({ email: 'owner@example.com', password: 'password123' });

    await component.signInWithEmail();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/business/clinic/patients', { replaceUrl: true });
  });

  it('does not accept a clinic account on the platform staff entry', async () => {
    const component = create('platform');
    auth.signInWithEmail.and.resolveTo('clinic-admin');
    component.form.setValue({ email: 'owner@example.com', password: 'password123' });

    await component.signInWithEmail();

    expect(auth.logout).toHaveBeenCalled();
    expect(component.error()).toContain('does not have platform access');
  });

  it('returns an existing clinic owner away from the platform staff entry', async () => {
    const component = create('platform', null, 'clinic-admin');

    await component.ngOnInit();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/business/clinic/dashboard', { replaceUrl: true });
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it('ignores an external return URL', async () => {
    const component = create('clinic', '//malicious.example');
    auth.signInWithEmail.and.resolveTo('clinic-admin');
    component.form.setValue({ email: 'owner@example.com', password: 'password123' });

    await component.signInWithEmail();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/business/clinic/dashboard', { replaceUrl: true });
  });

  it('routes an unverified account to verification', async () => {
    const component = create('clinic');
    auth.signInWithEmail.and.resolveTo('unverified');
    component.form.setValue({ email: 'owner@example.com', password: 'password123' });

    await component.signInWithEmail();

    expect(router.navigate).toHaveBeenCalledWith(['/business/verify-email'], {
      queryParams: undefined,
      replaceUrl: true,
    });
  });
});