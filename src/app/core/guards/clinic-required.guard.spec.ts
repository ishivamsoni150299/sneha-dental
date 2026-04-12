import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { clinicRequiredGuard } from './clinic-required.guard';
import { ClinicConfigService } from '../services/clinic-config.service';

describe('clinicRequiredGuard', () => {
  let mockRouter: jasmine.SpyObj<Router>;

  function setup(isLoaded: boolean, comingSoon = false) {
    mockRouter = jasmine.createSpyObj('Router', ['navigate']);
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
      clinicRequiredGuard({} as any, {} as any)
    );
    expect(result).toBeTrue();
  });

  it('returns false and redirects to /business when clinic is not loaded', () => {
    setup(false);
    const result = TestBed.runInInjectionContext(() =>
      clinicRequiredGuard({} as any, {} as any)
    );
    expect(result).toBeFalse();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/business']);
  });

  it('returns false and redirects to /coming-soon when comingSoon is true', () => {
    setup(true, true);
    const result = TestBed.runInInjectionContext(() =>
      clinicRequiredGuard({} as any, {} as any)
    );
    expect(result).toBeFalse();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/coming-soon']);
  });

  it('does not navigate at all when clinic is loaded and live', () => {
    setup(true, false);
    TestBed.runInInjectionContext(() =>
      clinicRequiredGuard({} as any, {} as any)
    );
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  it('checks isLoaded before comingSoon — never reads config when not loaded', () => {
    // config is undefined — if guard reads config before checking isLoaded it would throw
    mockRouter = jasmine.createSpyObj('Router', ['navigate']);
    TestBed.configureTestingModule({
      providers: [
        { provide: ClinicConfigService, useValue: { isLoaded: false, config: undefined } },
        { provide: Router, useValue: mockRouter },
      ],
    });
    expect(() =>
      TestBed.runInInjectionContext(() => clinicRequiredGuard({} as any, {} as any))
    ).not.toThrow();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/business']);
  });
});
