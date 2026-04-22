import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { clinicRequiredGuard } from './clinic-required.guard';
import { ClinicConfigService } from '../services/clinic-config.service';

describe('clinicRequiredGuard', () => {
  let mockRouter: jasmine.SpyObj<Router>;
  const businessTree = {} as ReturnType<Router['createUrlTree']>;
  const comingSoonTree = {} as ReturnType<Router['createUrlTree']>;

  function setup(isLoaded: boolean, comingSoon = false) {
    mockRouter = jasmine.createSpyObj('Router', ['createUrlTree']);
    mockRouter.createUrlTree.and.callFake((commands: readonly unknown[]) => {
      const path = Array.isArray(commands) ? commands.join('/') : '';
      return path === '/coming-soon' ? comingSoonTree : businessTree;
    });

    TestBed.configureTestingModule({
      providers: [
        {
          provide: ClinicConfigService,
          useValue: { isLoaded, config: { comingSoon } },
        },
        { provide: Router, useValue: mockRouter },
      ],
    });
  }

  it('returns true when clinic is loaded and not in coming-soon mode', () => {
    setup(true, false);
    const result = TestBed.runInInjectionContext(() =>
      clinicRequiredGuard({} as never, {} as never),
    );
    expect(result).toBeTrue();
  });

  it('returns a UrlTree to /business when clinic is not loaded', () => {
    setup(false);
    const result = TestBed.runInInjectionContext(() =>
      clinicRequiredGuard({} as never, {} as never),
    );
    expect(result).toBe(businessTree);
    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(['/business']);
  });

  it('returns a UrlTree to /coming-soon when comingSoon is true', () => {
    setup(true, true);
    const result = TestBed.runInInjectionContext(() =>
      clinicRequiredGuard({} as never, {} as never),
    );
    expect(result).toBe(comingSoonTree);
    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(['/coming-soon']);
  });

  it('does not create a redirect when clinic is loaded and live', () => {
    setup(true, false);
    TestBed.runInInjectionContext(() =>
      clinicRequiredGuard({} as never, {} as never),
    );
    expect(mockRouter.createUrlTree).not.toHaveBeenCalled();
  });

  it('checks isLoaded before accessing config', () => {
    mockRouter = jasmine.createSpyObj('Router', ['createUrlTree']);
    mockRouter.createUrlTree.and.returnValue(businessTree);

    TestBed.configureTestingModule({
      providers: [
        { provide: ClinicConfigService, useValue: { isLoaded: false, config: undefined } },
        { provide: Router, useValue: mockRouter },
      ],
    });

    expect(() =>
      TestBed.runInInjectionContext(() => clinicRequiredGuard({} as never, {} as never)),
    ).not.toThrow();
    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(['/business']);
  });
});
