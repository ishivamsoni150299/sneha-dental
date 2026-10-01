import { TestBed } from '@angular/core/testing';
import { convertToParamMap, provideRouter, Router, UrlTree } from '@angular/router';
import { AuthFacade, type AuthRole } from '../services/auth-facade.service';
import { workspaceGuard } from './workspace.guard';

describe('workspace entry', () => {
  async function destination(role: AuthRole | null, returnUrl?: string): Promise<string> {
    TestBed.configureTestingModule({ providers: [provideRouter([]), {
      provide: AuthFacade, useValue: { authReady: Promise.resolve(), role: () => role },
    }] });
    const result = await TestBed.runInInjectionContext(() => workspaceGuard({
      queryParamMap: convertToParamMap(returnUrl ? { returnUrl } : {}),
    } as never, {} as never));
    return TestBed.inject(Router).serializeUrl(result as UrlTree);
  }

  it('sends visitors to the shared sign-in', async () => {
    expect(await destination(null)).toBe('/account?returnUrl=%2Fworkspace');
  });
  for (const [role, path] of [
    ['patient', '/appointments'], ['dentist', '/professional/workspace'],
    ['clinic-admin', '/business/clinic/dashboard'], ['platform-admin', '/business/clinics'],
    ['incomplete-signup', '/business/signup?resume=true'],
  ] as const) {
    it(`opens the ${role} workspace`, async () => {
      expect(await destination(role)).toBe(path);
    });
  }
  it('does not forward patients into administration', async () => {
    expect(await destination('patient', '/business/clinics')).toBe('/appointments');
  });
  it('retains a valid booking return path', async () => {
    expect(await destination('patient', '/dentists/example/book?mode=video')).toBe('/dentists/example/book?mode=video');
  });
});
