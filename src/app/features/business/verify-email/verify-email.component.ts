import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthFacade, type AuthRole } from '../../../core/services/auth-facade.service';

@Component({
  selector: 'app-verify-email',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './verify-email.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VerifyEmailComponent implements OnInit {
  private readonly auth = inject(AuthFacade);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly email = this.auth.currentUser;
  readonly checking = signal(false);
  readonly resending = signal(false);
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.auth.authReady;
    if (!this.auth.currentUser()) {
      await this.router.navigate(['/business/login'], {
        queryParams: this.returnUrl() ? { returnUrl: this.returnUrl() } : undefined,
        replaceUrl: true,
      });
      return;
    }

    const role = this.auth.role();
    if (role && role !== 'unverified') await this.continueForRole(role);
  }

  async checkVerification(): Promise<void> {
    if (this.checking()) return;
    this.checking.set(true);
    this.message.set(null);
    this.error.set(null);
    try {
      const role = await this.auth.refreshVerificationStatus();
      if (role === 'unverified') {
        this.message.set('Your email is not verified yet. Open the latest email, then check again.');
      } else {
        await this.continueForRole(role);
      }
    } catch {
      this.error.set('We could not refresh your account. Please try again.');
    } finally {
      this.checking.set(false);
    }
  }

  async resend(): Promise<void> {
    if (this.resending()) return;
    this.resending.set(true);
    this.message.set(null);
    this.error.set(null);
    try {
      await this.auth.resendVerificationEmail();
      this.message.set('A new verification email has been sent.');
    } catch (error) {
      const code = (error as { code?: string }).code ?? '';
      this.error.set(code === 'auth/too-many-requests'
        ? 'Too many requests. Wait a few minutes before resending.'
        : 'We could not send another email. Please try again.');
    } finally {
      this.resending.set(false);
    }
  }

  async useAnotherAccount(): Promise<void> {
    await this.auth.logout();
    await this.router.navigate(['/business/login'], { replaceUrl: true });
  }

  private async continueForRole(role: AuthRole): Promise<void> {
    if (role === 'platform-admin') {
      await this.router.navigateByUrl('/business/clinics', { replaceUrl: true });
    } else if (role === 'clinic-admin') {
      await this.router.navigateByUrl(this.returnUrl() || '/business/clinic/dashboard', { replaceUrl: true });
    } else {
      await this.router.navigate(['/business/signup'], {
        queryParams: { resume: 'true' },
        replaceUrl: true,
      });
    }
  }

  private returnUrl(): string | null {
    const value = this.route.snapshot.queryParamMap.get('returnUrl');
    return value?.startsWith('/business/clinic/') && !value.startsWith('//') ? value : null;
  }
}