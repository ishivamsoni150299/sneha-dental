import { Component, ChangeDetectionStrategy, inject, signal, HostListener, type OnInit } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthFacade } from '../../../core/services/auth-facade.service';
import { ClinicApiService } from '../../../core/services/clinic-api.service';
import { Router } from '@angular/router';
import { PlatformBrandComponent } from '../../../shared/components/platform-brand/platform-brand.component';
import { ModalDirective } from '../../../shared/directives/modal.directive';

@Component({
  selector: 'app-business-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, PlatformBrandComponent, ModalDirective],
  templateUrl: './business-shell.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessShellComponent implements OnInit {
  readonly auth        = inject(AuthFacade);
  private readonly router      = inject(Router);
  private readonly clinicStore = inject(ClinicApiService);

  clinicCount  = signal<number | null>(null);
  menuOpen     = signal(false);
  readonly primaryLinks = [
    { path: '/business/dentists/verification', label: 'Dentists', icon: 'ph-seal-check' },
    { path: '/business/clinics', label: 'Clinics', icon: 'ph-buildings' },
    { path: '/business/leads', label: 'Leads', icon: 'ph-users' },
  ];
  readonly moreLinks = [
    { path: '/business/patient-requests', label: 'Patient dentist requests' },
    { path: '/business/reviews', label: 'Reviews' },
    { path: '/business/analytics', label: 'Analytics' },
    { path: '/business/revenue', label: 'Revenue' },
    { path: '/account/recovery', label: 'Account recovery' },
  ];
  get moreActive(): boolean { return this.moreLinks.some(link => this.router.url.split('?')[0] === link.path); }

  @HostListener('document:keydown.escape')
  closeMenu(): void { this.menuOpen.set(false); }

  ngOnInit(): void {
    void this.loadClinicCount();
  }

  private async loadClinicCount(): Promise<void> {
    try {
      const list = await this.clinicStore.getAll();
      this.clinicCount.set(list.length);
    } catch { /* non-critical */ }
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigate(['/platform/login'], { replaceUrl: true });
  }
}
