import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthFacade, type AuthRole } from '../../../core/services/auth-facade.service';
import { PlatformBrandComponent } from '../../../shared/components/platform-brand/platform-brand.component';
import { PasswordLoginComponent } from '../../../shared/components/password-login/password-login.component';

type LoginPortal = 'clinic' | 'platform';


@Component({
  selector: 'app-login',
  standalone: true,
  imports: [RouterLink, PlatformBrandComponent, PasswordLoginComponent],
  templateUrl: './login.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent implements OnInit {

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthFacade);

  readonly portal = signal<LoginPortal>(
    this.route.snapshot.data['portal'] === 'platform' ? 'platform' : 'clinic',
  );
  readonly isPlatform = computed(() => this.portal() === 'platform');

  async ngOnInit(): Promise<void> {
    // Resolve the restored session before choosing the correct workspace.
    await this.auth.authReady;
    const role = this.auth.role();
    if (role) await this.routeResolvedUser(role);
  }

  async onAuthenticated(role: AuthRole): Promise<void> { await this.routeResolvedUser(role); }

  private async routeResolvedUser(role: AuthRole): Promise<void> {
    const returnUrl = this.safeReturnUrl();

    if (role === 'dentist') {
      await this.router.navigateByUrl('/professional/workspace', { replaceUrl: true });
      return;
    }

    if (role === 'patient') {
      await this.router.navigateByUrl('/appointments', { replaceUrl: true });
      return;
    }

    if (role === 'unverified' || role === 'incomplete-signup') {
      await this.router.navigate(['/business/signup'], {
        queryParams: { resume: 'true' },
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

    if (role === 'clinic-admin') {
      await this.router.navigateByUrl((!this.isPlatform() && returnUrl) || '/business/clinic/dashboard', { replaceUrl: true });
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

}
