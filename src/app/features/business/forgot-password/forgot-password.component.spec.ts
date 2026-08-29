import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { AuthFacade } from '../../../core/services/auth-facade.service';
import { ForgotPasswordComponent } from './forgot-password.component';

describe('ForgotPasswordComponent', () => {
  let sendPasswordReset: jasmine.Spy;

  function create(): ForgotPasswordComponent {
    const router = jasmine.createSpyObj(
      'Router',
      ['createUrlTree', 'serializeUrl'],
      { events: of() },
    );
    router.createUrlTree.and.returnValue({} as never);
    router.serializeUrl.and.returnValue('/');
    sendPasswordReset = jasmine.createSpy('sendPasswordReset');

    TestBed.configureTestingModule({
      imports: [ForgotPasswordComponent],
      providers: [
        { provide: AuthFacade, useValue: { sendPasswordReset } },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: {} },
      ],
    });

    return TestBed.createComponent(ForgotPasswordComponent).componentInstance;
  }

  it('does not submit an invalid email address', async () => {
    const component = create();

    await component.submit();

    expect(sendPasswordReset).not.toHaveBeenCalled();
    expect(component.form.controls.email.touched).toBeTrue();
  });

  it('shows the same success state when Firebase does not recognize the account', async () => {
    const component = create();
    component.form.controls.email.setValue('unknown@example.com');
    sendPasswordReset.and.rejectWith({ code: 'auth/user-not-found' });

    await component.submit();

    expect(component.submitted()).toBeTrue();
    expect(component.error()).toBeNull();
  });

  it('reports reset-request throttling without claiming an email was sent', async () => {
    const component = create();
    component.form.controls.email.setValue('owner@example.com');
    sendPasswordReset.and.rejectWith({ code: 'auth/too-many-requests' });

    await component.submit();

    expect(component.submitted()).toBeFalse();
    expect(component.error()).toContain('Too many reset requests');
  });
});
