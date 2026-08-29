import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthFacade } from '../../../core/services/auth-facade.service';

@Component({
  selector: 'app-clinic-account-menu',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './clinic-account-menu.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClinicAccountMenuComponent {
  private readonly auth = inject(AuthFacade);
  private readonly router = inject(Router);

  readonly variant = input<'light' | 'dark'>('light');
  readonly placement = input<'up' | 'down'>('down');
  readonly signingOut = signal(false);
  readonly email = computed(() => this.auth.currentUser()?.email ?? 'Clinic account');
  readonly initial = computed(() => this.email().slice(0, 1).toUpperCase());

  async logout(): Promise<void> {
    if (this.signingOut()) return;
    this.signingOut.set(true);
    try {
      await this.auth.logout();
      await this.router.navigate(['/business/login'], { replaceUrl: true });
    } finally {
      this.signingOut.set(false);
    }
  }
}