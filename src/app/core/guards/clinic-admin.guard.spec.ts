import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthFacade, type AuthRole } from '../services/auth-facade.service';
import { ClinicConfigService } from '../services/clinic-config.service';
import { clinicAdminGuard } from './clinic-admin.guard';

describe('clinicAdminGuard', () => {
  let router: jasmine.SpyObj<Router>;

  function setup(options: {
    authenticated?: boolean;
    role?: AuthRole | null;
    loaded?: boolean;
    plan?: 'trial' | 'starter' | 'pro';
    status?: 'trial' | 'active' | 'expired' | 'cancelled';
    trialEndDate?: string | null;
    subscriptionEndDate?: string | null;
  } = {}) {
    router = jasmine.createSpyObj('Router', ['createUrlTree']);
    router.createUrlTree.and.callFake((commands: unknown[]) => ({ commands }) as never);
    const user = options.authenticated === false ? null : { uid: 'owner-1' };
    const auth = {
      authReady: Promise.resolve(),
      isAuthenticated: options.authenticated !== false,
      currentUser: () => user,
      role: () => options.role ?? 'clinic-admin',
    };
    const clinic = {
      isLoaded: options.loaded ?? true,
      loadByUid: jasmine.createSpy('loadByUid').and.resolveTo(true),
      config: {
        subscriptionPlan: options.plan ?? 'trial',
        subscriptionStatus: options.status ?? 'trial',
        trialEndDate: options.trialEndDate ?? null,
        subscriptionEndDate: options.subscriptionEndDate ?? null,
      },
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthFacade, useValue: auth },
        { provide: ClinicConfigService, useValue: clinic },
        { provide: Router, useValue: router },
      ],
    });
  }

  async function run() {
    return TestBed.runInInjectionContext(() =>
      clinicAdminGuard({} as never, { url: '/business/clinic/patients' } as never),
    );
  }

  it('allows a clinic admin with an active workspace', async () => {
    setup();
    expect(await run()).toBeTrue();
  });

  it('preserves the requested page when authentication is required', async () => {
    setup({ authenticated: false, role: null });
    await run();
    expect(router.createUrlTree).toHaveBeenCalledWith(['/business/login'], {
      queryParams: { returnUrl: '/business/clinic/patients' },
    });
  });

  it('requires email verification before clinic access', async () => {
    setup({ role: 'unverified' });
    await run();
    expect(router.createUrlTree).toHaveBeenCalledWith(['/business/verify-email'], {
      queryParams: { returnUrl: '/business/clinic/patients' },
    });
  });

  it('resumes setup when the account has no clinic', async () => {
    setup({ role: 'incomplete-signup' });
    await run();
    expect(router.createUrlTree).toHaveBeenCalledWith(['/business/signup'], {
      queryParams: { resume: 'true' },
    });
  });

  it('sends an expired clinic to the renewal page', async () => {
    setup({ plan: 'starter', status: 'expired' });
    await run();
    expect(router.createUrlTree).toHaveBeenCalledWith(['/business/clinic/expired']);
  });

  it('keeps legacy Free clinics active after their old trial date', async () => {
    setup({
      plan: 'trial',
      status: 'expired',
      trialEndDate: '2020-01-01',
    });
    expect(await run()).toBeTrue();
  });

  it('blocks an active paid plan after its renewal grace period', async () => {
    setup({
      plan: 'pro',
      status: 'active',
      subscriptionEndDate: '2020-01-01',
    });
    await run();
    expect(router.createUrlTree).toHaveBeenCalledWith(['/business/clinic/expired']);
  });
});