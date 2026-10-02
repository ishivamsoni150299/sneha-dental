import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { AuthFacade, type AuthRole, type PlatformUser } from '../../../core/services/auth-facade.service';
import { SignupComponent } from './signup.component';

describe('SignupComponent', () => {
  let router: jasmine.SpyObj<Router>;

  function create(role: AuthRole): SignupComponent {
    router = jasmine.createSpyObj(
      'Router',
      ['navigate', 'createUrlTree', 'serializeUrl'],
      { events: of() },
    );
    router.navigate.and.resolveTo(true);
    router.createUrlTree.and.returnValue({} as never);
    router.serializeUrl.and.returnValue('/');

    TestBed.configureTestingModule({
      imports: [SignupComponent],
      providers: [
        {
          provide: AuthFacade,
          useValue: {
            authReady: Promise.resolve(),
            currentUser: () => ({ uid: 'user-1', email: 'owner@example.com' } as PlatformUser),
            role: () => role,

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

    await component.onAuthenticated('clinic-admin');

    expect(router.navigate).toHaveBeenCalledWith(['/business/clinic/dashboard']);
    expect(component.step()).toBe(0);
  });

  it('keeps reversed working hours on the hours step with an explanation', () => {
    const component = create('incomplete-signup');
    component.step.set(2);
    component.clinicHours.set([{ day: 'Monday', open: '18:00', close: '09:00', closed: false }]);
    component.next();
    expect(component.step()).toBe(2);
    expect(component.error()).toContain('Monday');
  });

  it('allows closed days without requiring bookable hours', () => {
    const component = create('incomplete-signup');
    component.step.set(2);
    component.clinicHours.set([{ day: 'Sunday', open: '', close: '', closed: true }]);
    component.next();
    expect(component.step()).toBe(4);
    expect(component.error()).toBeNull();
  });

  it('rejects equal opening and closing times', () => {
    const component = create('incomplete-signup');
    component.step.set(2);
    component.clinicHours.set([{ day: 'Monday', open: '09:00', close: '09:00', closed: false }]);
    component.next();
    expect(component.step()).toBe(2);
  });

  it('keeps a patient identity out of clinic onboarding', async () => {
    const component = create('patient');

    await component.onAuthenticated('patient');

    expect(router.navigate).toHaveBeenCalledWith(['/appointments']);
    expect(component.step()).toBe(0);
  });

  it('proceeds directly to step 1 for an incomplete signup', async () => {
    const component = create('incomplete-signup');

    await component.onAuthenticated('incomplete-signup');

    expect(router.navigate).not.toHaveBeenCalled();
    expect(component.step()).toBe(1);
  });

  it('starts onboarding only for an identity without a workspace', async () => {
    const component = create('incomplete-signup');

    await component.onAuthenticated('incomplete-signup');

    expect(router.navigate).not.toHaveBeenCalled();
    expect(component.step()).toBe(1);
  });
});