import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthFacade, type AuthRole } from '../../../core/services/auth-facade.service';

type LoginPortal = 'clinic' | 'platform';
type LoginMethod = 'email' | 'google';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthFacade);

  readonly portal = signal<LoginPortal>(
    this.route.snapshot.data['portal'] === 'platform' ? 'platform' : 'clinic',
  );
  readonly loadingMethod = signal<LoginMethod | null>(null);
  readonly error = signal<string | null>(null);
  readonly showPassword = signal(false);

  readonly isPlatform = computed(() => this.portal() === 'platform');
  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  async ngOnInit(): Promise<void> {
    await this.auth.authReady;
    const role = this.auth.role();
    if (role) await this.routeResolvedUser(role, false);
  }

  async signInWithEmail(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.loadingMethod()) return;

    this.loadingMethod.set('email');
    this.error.set(null);
    try {
      const { email, password } = this.form.getRawValue();
      const role = await this.auth.signInWithEmail(email.trim(), password);
      await this.routeResolvedUser(role, true);
    } catch (error) {
      this.error.set(this.authErrorMessage(error));
    } finally {
      this.loadingMethod.set(null);
    }
  }

  async signInWithGoogle(): Promise<void> {
    if (this.loadingMethod()) return;

    this.loadingMethod.set('google');
    this.error.set(null);
    try {
      const role = await this.auth.signInWithGoogle();
      await this.routeResolvedUser(role, true);
    } catch (error) {
      const code = (error as { code?: string }).code ?? '';
      if (!code.includes('popup-closed') && !code.includes('cancelled')) {
        this.error.set(this.authErrorMessage(error));
      }
    } finally {
      this.loadingMethod.set(null);
    }
  }

  isInvalid(field: 'email' | 'password'): boolean {
    const control = this.form.controls[field];
    return control.invalid && control.touched;
  }

  private async routeResolvedUser(role: AuthRole, fromAttempt: boolean): Promise<void> {
    const returnUrl = this.safeReturnUrl();

    if (role === 'unverified') {
      await this.router.navigate(['/business/verify-email'], {
        queryParams: returnUrl ? { returnUrl } : undefined,
        replaceUrl: true,
      });
      return;
    }

    if (role === 'platform-admin') {
      await this.router.navigateByUrl(
        this.isPlatform() && returnUrl ? returnUrl : '/business/clinics',
        { replaceUrl: true },
      );
      return;
    }

    if (this.isPlatform()) {
      if (!fromAttempt) {
        if (role === 'clinic-admin') {
          await this.router.navigateByUrl('/business/clinic/dashboard', { replaceUrl: true });
        } else {
          await this.router.navigate(['/business/signup'], {
            queryParams: { resume: 'true' },
            replaceUrl: true,
          });
        }
        return;
      }
      await this.auth.logout();
      this.error.set('This account does not have platform access. Use your authorised staff account.');
      return;
    }

    if (role === 'clinic-admin') {
      await this.router.navigateByUrl(returnUrl || '/business/clinic/dashboard', { replaceUrl: true });
      return;
    }

    await this.router.navigate(['/business/signup'], {
      queryParams: { resume: 'true' },
      replaceUrl: true,
    });
  }

  private safeReturnUrl(): string | null {
    const value = this.route.snapshot.queryParamMap.get('returnUrl');
    if (!value || !value.startsWith('/') || value.startsWith('//')) return null;
    if (this.isPlatform()) {
      return value.startsWith('/business/') && !value.startsWith('/business/clinic/')
        ? value
        : null;
    }
    return value.startsWith('/business/clinic/') ? value : null;
  }

  private authErrorMessage(error: unknown): string {
    const code = (error as { code?: string }).code ?? '';
    if (['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password'].includes(code)) {
      return 'The email or password is incorrect.';
    }
    if (code === 'auth/user-disabled') return 'This account has been disabled. Contact support.';
    if (code === 'auth/too-many-requests') return 'Too many attempts. Wait a few minutes, then try again.';
    if (code === 'auth/network-request-failed') return 'Check your internet connection and try again.';
    if (code === 'auth/popup-blocked') return 'Allow pop-ups for this site, then try Google sign-in again.';
    if (code === 'auth/account-exists-with-different-credential') {
      return 'This email uses a different sign-in method. Sign in with your email and password.';
    }
    return 'We could not sign you in. Please try again.';
  }
}