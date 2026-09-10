import { TestBed } from '@angular/core/testing';
import { AuthFacade } from '../../../core/services/auth-facade.service';
import { PasswordLoginComponent } from './password-login.component';

describe('PasswordLoginComponent', () => {
  const setup = (signup = false, portal = 'clinic') => {
    const auth = jasmine.createSpyObj('AuthFacade', ['signInWithEmail', 'signInProfessional', 'createAccountWithEmail', 'createProfessionalAccount', 'role', 'logout'], { authReady: Promise.resolve() });
    auth.signInWithEmail.and.resolveTo('clinic-admin');
    auth.createAccountWithEmail.and.resolveTo({});
    auth.role.and.returnValue('incomplete-signup');
    auth.logout.and.resolveTo();
    TestBed.configureTestingModule({ imports: [PasswordLoginComponent], providers: [{ provide: AuthFacade, useValue: auth }] });
    const fixture = TestBed.createComponent(PasswordLoginComponent);
    fixture.componentRef.setInput('signup', signup);
    fixture.componentRef.setInput('portal', portal);
    const component = fixture.componentInstance;
    component.form.patchValue({ email: 'owner@example.com', password: 'test-password', confirm: 'test-password' });
    return { component, auth };
  };
  it('signs in directly with a password', async () => {
    const { component, auth } = setup();
    const emit = spyOn(component.authenticated, 'emit');
    await component.submit();
    expect(auth.signInWithEmail).toHaveBeenCalledWith('owner@example.com', 'test-password');
    expect(emit).toHaveBeenCalledWith('clinic-admin');
  });
  it('creates an account and continues setup without an email link', async () => {
    const { component, auth } = setup(true);
    const emit = spyOn(component.authenticated, 'emit');
    await component.submit();
    expect(auth.createAccountWithEmail).toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith('incomplete-signup');
  });
  it('rejects mismatched passwords before making a request', async () => {
    const { component, auth } = setup(true);
    component.form.controls.confirm.setValue('different');
    await component.submit();
    expect(auth.createAccountWithEmail).not.toHaveBeenCalled();
    expect(component.error()).toContain('do not match');
  });
  it('logs out accounts without platform access', async () => {
    const { component, auth } = setup(false, 'platform');
    const emit = spyOn(component.authenticated, 'emit');
    await component.submit();
    expect(auth.logout).toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });
});
