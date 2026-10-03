import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { AuthFacade, type AuthRole, type PlatformUser } from '../../../core/services/auth-facade.service';
import { SignupComponent } from './signup.component';
import { AuthenticatedApiService } from '../../../core/services/authenticated-api.service';
import { BillingService } from '../../../core/services/billing.service';

describe('SignupComponent', () => {
  let router: jasmine.SpyObj<Router>;
  let api: jasmine.SpyObj<AuthenticatedApiService>;
  let billing: jasmine.SpyObj<BillingService>;

  function create(role: AuthRole): SignupComponent {
    api = jasmine.createSpyObj('AuthenticatedApiService', ['fetch']);
    billing = jasmine.createSpyObj('BillingService', ['createSubscription']);
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
        { provide: AuthenticatedApiService, useValue: api },
        { provide: BillingService, useValue: billing },
        {
          provide: AuthFacade,
          useValue: {
            authReady: Promise.resolve(),
            currentUser: () => ({ uid: 'user-1', email: 'owner@example.com' } as PlatformUser),
            role: () => role,
            resolveCurrentUser: () => Promise.resolve('clinic-admin'),

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

  it('retries payment after successful signup without creating the clinic twice', async () => {
    const component = create('incomplete-signup');
    await component.onAuthenticated('incomplete-signup');
    component.step1.patchValue({ name: 'Clinic', slug: 'clinic', phone: '9999999999' });
    component.selectedPlan.set('starter');
    api.fetch.and.resolveTo(new Response(JSON.stringify({ clinicId: 'clinic-id', plan: 'starter', billingCycle: 'monthly' })));
    billing.createSubscription.and.rejectWith(new Error('Checkout temporarily unavailable'));
    await component.submit();
    expect(component.step()).toBe(5);
    expect(component.checkoutError()).toContain('temporarily unavailable');
    billing.createSubscription.and.resolveTo({ subscriptionId: 'sub_test', paymentUrl: 'https://rzp.io/test', shortUrl: 'https://rzp.io/test', paymentMode: 'subscription', manualPaymentUrl: null, billingCycle: 'monthly', amount: 999 });
    await component.prepareCheckout();
    expect(api.fetch).toHaveBeenCalledTimes(1);
    expect(component.result()?.paymentUrl).toBe('https://rzp.io/test');
    expect(component.checkoutError()).toBeNull();
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
