import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { superAdminGuard } from './super-admin.guard';
import { SuperAuthService } from '../services/super-auth.service';

describe('superAdminGuard', () => {
  let mockRouter: jasmine.SpyObj<Router>;

  function setup(isLoggedIn: boolean, authReady: Promise<void> = Promise.resolve()) {
    mockRouter = jasmine.createSpyObj('Router', ['createUrlTree']);
    mockRouter.createUrlTree.and.returnValue({ urlTree: '/business/login' } as any);
    TestBed.configureTestingModule({
      providers: [
        { provide: SuperAuthService, useValue: { isLoggedIn, authReady } },
        { provide: Router,           useValue: mockRouter },
      ],
    });
  }

  it('returns true when super admin is logged in', async () => {
    setup(true);
    const result = await TestBed.runInInjectionContext(() =>
      superAdminGuard({} as any, {} as any)
    );
    expect(result).toBeTrue();
  });

  it('returns a UrlTree to /business/login when not logged in', async () => {
    setup(false);
    const result = await TestBed.runInInjectionContext(() =>
      superAdminGuard({} as any, {} as any)
    );
    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(['/business/login']);
    expect(result).toBeTruthy();
  });

  it('does not return true for a non-super-admin user', async () => {
    setup(false);
    const result = await TestBed.runInInjectionContext(() =>
      superAdminGuard({} as any, {} as any)
    );
    expect(result).not.toBeTrue();
  });

  it('waits for authReady before evaluating login state', async () => {
    let resolveReady!: () => void;
    const authReady = new Promise<void>(resolve => { resolveReady = resolve; });
    setup(true, authReady);

    const guardPromise = TestBed.runInInjectionContext(() =>
      superAdminGuard({} as any, {} as any)
    ) as Promise<boolean>;

    // Guard should still be pending
    let settled = false;
    guardPromise.then(() => { settled = true; });

    await Promise.resolve(); // flush microtask queue
    expect(settled).toBeFalse();

    resolveReady();
    const result = await guardPromise;
    expect(result).toBeTrue();
  });
});
