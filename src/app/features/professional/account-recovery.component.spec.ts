import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthFacade } from '../../core/services/auth-facade.service';
import { AccountRecoveryComponent } from './account-recovery.component';

describe('Account recovery feedback', () => {
  it('clears previous success before rejecting another reset', async () => {
    const auth = jasmine.createSpyObj('AuthFacade', ['confirmPasswordReset']);
    auth.confirmPasswordReset.and.rejectWith(new Error('Invalid or already used code.'));
    TestBed.configureTestingModule({ providers: [
      { provide: AuthFacade, useValue: auth },
      { provide: Router, useValue: {} },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } },
    ] });
    const component = TestBed.runInInjectionContext(() => new AccountRecoveryComponent());
    component.message.set('Previous reset succeeded.');
    component.form.setValue({ email: 'patient@example.test', code: 'consumed-code', password: 'New-password-123', confirm: 'New-password-123' });
    await component.reset();
    expect(component.message()).toBe('');
    expect(component.error()).toContain('already used');
    expect(component.busy()).toBeFalse();
  });

  it('ends a stranded session through the normal logout service', async () => {
    const auth = jasmine.createSpyObj('AuthFacade', ['logout']);
    auth.logout.and.resolveTo();
    const router = jasmine.createSpyObj('Router', ['navigateByUrl']);
    router.navigateByUrl.and.resolveTo(true);
    TestBed.configureTestingModule({ providers: [
      { provide: AuthFacade, useValue: auth }, { provide: Router, useValue: router },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => 'unavailable' } } } },
    ] });
    const component = TestBed.runInInjectionContext(() => new AccountRecoveryComponent());
    await component.logout();
    expect(component.workspaceUnavailable).toBeTrue();
    expect(auth.logout).toHaveBeenCalledTimes(1);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/account', { replaceUrl: true });
  });
});