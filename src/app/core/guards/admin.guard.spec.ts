import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { adminGuard } from './admin.guard';
import { AuthService } from '../services/auth.service';

describe('adminGuard', () => {
  let mockRouter: jasmine.SpyObj<Router>;

  function setup(isLoggedIn: boolean) {
    mockRouter = jasmine.createSpyObj('Router', ['navigate']);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { isLoggedIn } },
        { provide: Router,      useValue: mockRouter },
      ],
    });
  }

  it('returns true when user is logged in', () => {
    setup(true);
    const result = TestBed.runInInjectionContext(() =>
      adminGuard({} as any, {} as any)
    );
    expect(result).toBeTrue();
  });

  it('returns false when user is not logged in', () => {
    setup(false);
    const result = TestBed.runInInjectionContext(() =>
      adminGuard({} as any, {} as any)
    );
    expect(result).toBeFalse();
  });

  it('navigates to /admin/login when not logged in', () => {
    setup(false);
    TestBed.runInInjectionContext(() => adminGuard({} as any, {} as any));
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/admin/login']);
  });

  it('does not navigate when logged in', () => {
    setup(true);
    TestBed.runInInjectionContext(() => adminGuard({} as any, {} as any));
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });
});
