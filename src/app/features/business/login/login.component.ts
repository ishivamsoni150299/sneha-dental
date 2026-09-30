import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthFacade, type AuthRole } from '../../../core/services/auth-facade.service';
import { PasswordLoginComponent } from '../../../shared/components/password-login/password-login.component';
import { accountDestination } from '../../../core/utils/account-navigation';

type AccountType = 'patient' | 'dentist' | 'clinic';
@Component({
  selector: 'app-login', standalone: true,
  imports: [PasswordLoginComponent], templateUrl: './login.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly auth = inject(AuthFacade);
  private readonly destroyRef = inject(DestroyRef);
  readonly signup = signal(false);
  readonly accountType = signal<AccountType>('patient');
  readonly ready = signal(false);
  readonly loginForm = viewChild(PasswordLoginComponent);
  readonly types: { id: AccountType; label: string; help: string }[] = [
    { id: 'patient', label: 'Patient', help: 'Book and manage your dental visits.' },
    { id: 'dentist', label: 'Dentist', help: 'Create your profile and manage your practice.' },
    { id: 'clinic', label: 'Clinic', help: 'Set up your clinic and manage your team.' },
  ];
  async ngOnInit(): Promise<void> {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      this.signup.set(params.get('mode') === 'signup');
      const type = params.get('type');
      this.accountType.set(type === 'dentist' || type === 'clinic' ? type : 'patient');
    });
    await this.auth.authReady;
    const role = this.auth.role();
    if (role) await this.onAuthenticated(role);
    else this.ready.set(true);
  }
  setMode(signup: boolean): void {
    if (this.auth.isAuthenticated || this.loginForm()?.busy()) return;
    void this.router.navigate([], { relativeTo: this.route, queryParams: { mode: signup ? 'signup' : null }, queryParamsHandling: 'merge' });
  }
  setType(type: AccountType): void {
    if (this.auth.isAuthenticated || this.loginForm()?.busy()) return;
    void this.router.navigate([], { relativeTo: this.route, queryParams: { type }, queryParamsHandling: 'merge' });
  }
  async onAuthenticated(role: AuthRole): Promise<void> {
    await this.router.navigateByUrl(accountDestination(role, this.route.snapshot.queryParamMap.get('returnUrl')), { replaceUrl: true });
  }
}
