import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { superAdminGuard } from './super-admin.guard';
import { AuthFacade } from '../services/auth-facade.service';

describe('superAdminGuard', () => {
  let mockRouter: jasmine.SpyObj<Router>;

  function setup(role: 'platform-admin' | 'clinic-admin' | null, authReady: Promise<void> = Promise.resolve()) {
    mockRouter = jasmine.createSpyObj('Router', ['createUrlTree']);
    mockRouter.createUrlTree.and.returnValue({ urlTree: '/platform/login' } as any);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthFacade, useValue: { role: () => role, authReady } },
        { provide: Router,           useValue: mockRouter },
      ],
    });
  }

  it('returns true when super admin is logged in', async () => {
    setup('platform-admin');
    const result = await TestBed.runInInjectionContext(() =>
      superAdminGuard({} as any, { url: '/business/clinics' } as any)
    );
    expect(result).toBeTrue();
  });

  it('returns a UrlTree to /platform/login when not logged in', async () => {
    setup(null);
    const result = await TestBed.runInInjectionContext(() =>
      superAdminGuard({} as any, { url: '/business/clinics' } as any)
    );
    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(['/platform/login'], {
      queryParams: { returnUrl: '/business/clinics' },
    });
    expect(result).toBeTruthy();
  });

  it('does not return true for a non-super-admin user', async () => {
    setup('clinic-admin');
    const result = await TestBed.runInInjectionContext(() =>
      superAdminGuard({} as any, { url: '/business/clinics' } as any)
    );
    expect(result).not.toBeTrue();
  });

  it('waits for authReady before evaluating login state', async () => {
    let resolveReady!: () => void;
    const authReady = new Promise<void>(resolve => { resolveReady = resolve; });
    setup('platform-admin', authReady);

    const guardPromise = TestBed.runInInjectionContext(() =>
      superAdminGuard({} as any, { url: '/business/clinics' } as any)
    ) as Promise<boolean>;

    // Guard should still be pending
    let settled = false;
    void guardPromise.then(() => { settled = true; });

    await Promise.resolve(); // flush microtask queue
    expect(settled).toBeFalse();

    resolveReady();
    const result = await guardPromise;
    expect(result).toBeTrue();
  });
});
