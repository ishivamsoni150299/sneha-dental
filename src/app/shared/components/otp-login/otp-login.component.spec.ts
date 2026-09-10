import { TestBed } from '@angular/core/testing';
import { AuthFacade } from '../../../core/services/auth-facade.service';
import { OtpLoginComponent } from './otp-login.component';

describe('OtpLoginComponent', () => {
  afterEach(() => history.replaceState(null, '', '/'));
  let auth: jasmine.SpyObj<AuthFacade>;
  beforeEach(() => {
    auth = jasmine.createSpyObj('AuthFacade', ['requestOtp', 'verifyOtp', 'exchangeMagicLink']);
    auth.requestOtp.and.resolveTo(); auth.verifyOtp.and.resolveTo('clinic-admin'); auth.exchangeMagicLink.and.resolveTo('dentist');
    TestBed.configureTestingModule({imports:[OtpLoginComponent], providers:[{provide:AuthFacade,useValue:auth}]});
  });
  it('does not authenticate after sending and prevents immediate resends', async () => {
    const fixture = TestBed.createComponent(OtpLoginComponent); const component = fixture.componentInstance;
    const authenticated = jasmine.createSpy(); component.authenticated.subscribe(authenticated);
    component.form.controls.email.setValue('Owner@example.com');
    await component.send(); await component.send();
    expect(auth.requestOtp).toHaveBeenCalledOnceWith('owner@example.com','clinic');
    expect(authenticated).not.toHaveBeenCalled(); expect(component.sent()).toBeTrue();
    fixture.destroy();
  });
  it('keeps the verified destination fixed and authenticates only after OTP validation', async () => {
    const fixture = TestBed.createComponent(OtpLoginComponent); const component = fixture.componentInstance;
    const authenticated = jasmine.createSpy(); component.authenticated.subscribe(authenticated);
    component.form.controls.email.setValue('owner@example.com'); await component.send();
    component.form.controls.email.setValue('different@example.com'); component.form.controls.code.setValue('123456');
    await component.submit();
    expect(auth.verifyOtp).toHaveBeenCalledWith('owner@example.com','clinic','123456','');
    expect(authenticated).toHaveBeenCalledOnceWith('clinic-admin'); fixture.destroy();
  });
  it('shows an invalid-code error without emitting an authenticated session', async () => {
    const fixture = TestBed.createComponent(OtpLoginComponent); const component = fixture.componentInstance;
    const authenticated = jasmine.createSpy(); component.authenticated.subscribe(authenticated);
    component.form.controls.email.setValue('owner@example.com'); await component.send();
    component.form.controls.code.setValue('123456'); auth.verifyOtp.and.rejectWith(new Error('Code expired'));
    await component.submit(); expect(component.error()).toBe('Code expired'); expect(authenticated).not.toHaveBeenCalled(); fixture.destroy();
  });
  it('exchanges a Supabase magic-link token and removes it from the address bar', async () => {
    history.replaceState(null, '', '/professional/signup#access_token=link-token&type=magiclink');
    const fixture = TestBed.createComponent(OtpLoginComponent); const component = fixture.componentInstance;
    fixture.componentRef.setInput('portal', 'dentist'); fixture.detectChanges();
    const authenticated = jasmine.createSpy(); component.authenticated.subscribe(authenticated);
    component.form.controls.name.setValue('Dr. Sneha Sharma'); await component.submit();
    expect(location.hash).toBe('');
    expect(auth.exchangeMagicLink).toHaveBeenCalledWith('link-token', 'dentist', 'Dr. Sneha Sharma');
    expect(authenticated).toHaveBeenCalledOnceWith('dentist');
    history.replaceState(null, '', '/'); fixture.destroy();
  });
  it('completes clinic sign-in automatically after returning from the email link', async () => {
    history.replaceState(null, '', '/business/signup#access_token=link-token&refresh_token=secret&type=magiclink');
    auth.exchangeMagicLink.and.resolveTo('clinic-admin');
    const fixture = TestBed.createComponent(OtpLoginComponent);
    const authenticated = jasmine.createSpy(); fixture.componentInstance.authenticated.subscribe(authenticated);
    fixture.detectChanges(); await fixture.whenStable();
    expect(auth.exchangeMagicLink).toHaveBeenCalledOnceWith('link-token', 'clinic', '');
    expect(authenticated).toHaveBeenCalledOnceWith('clinic-admin');
    expect(location.hash).toBe(''); fixture.destroy();
  });
  it('shows a useful expired-link error without treating the redirect as verification', () => {
    history.replaceState(null, '', '/business/signup#error=access_denied&error_code=otp_expired');
    const fixture = TestBed.createComponent(OtpLoginComponent); fixture.detectChanges();
    expect(fixture.componentInstance.error()).toContain('expired');
    expect(auth.exchangeMagicLink).not.toHaveBeenCalled();
    expect(location.hash).toBe(''); fixture.destroy();
  });
  it('allows a fresh link request after token exchange fails', async () => {
    history.replaceState(null, '', '/business/login#access_token=expired-token');
    auth.exchangeMagicLink.and.rejectWith(new Error('Link expired'));
    const fixture = TestBed.createComponent(OtpLoginComponent); fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.componentInstance.error()).toBe('Link expired');
    fixture.componentInstance.requestNewLink();
    expect(fixture.componentInstance.magicLinkToken()).toBe('');
    expect(fixture.componentInstance.sent()).toBeFalse(); fixture.destroy();
  });
});
