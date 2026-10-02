import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ClinicConfigService } from '../../../core/services/clinic-config.service';
import { ClinicAccountMenuComponent } from '../clinic-account-menu/clinic-account-menu.component';

@Component({
  selector: 'app-clinic-workspace',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, ClinicAccountMenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="clinic-admin-shell">
      <header class="admin-topbar">
        <div class="admin-topbar-inner">
          <a routerLink="/business/clinic/dashboard" class="min-w-0">
            <p class="admin-page-title truncate">{{ clinic.config.name || 'Clinic workspace' }}</p>
            <p class="admin-page-subtitle">Clinic workspace</p>
          </a>
          <app-clinic-account-menu />
        </div>
        <nav class="admin-topbar-inner hidden flex-wrap justify-start pb-3 md:flex" aria-label="Clinic workspace">
          @for (item of sections; track item.path) {
            <a [routerLink]="item.path" routerLinkActive="ui-nav-link-active" ariaCurrentWhenActive="page"
               class="ui-nav-link">{{ item.label }}</a>
          }
        </nav>
      </header>
      <div class="clinic-workspace-content"><router-outlet /></div>
      <nav class="platform-mobile-nav md:hidden" aria-label="Clinic workspace">
        <div class="grid h-16 grid-cols-4">
          @for (item of sections; track item.path) {
            <a [routerLink]="item.path" routerLinkActive="ui-nav-link-active" ariaCurrentWhenActive="page"
               class="ui-nav-link flex-col justify-center gap-1 rounded-none text-xs">
              <svg aria-hidden="true" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path [attr.d]="item.icon" stroke-linecap="round" stroke-linejoin="round" /></svg>{{ item.label }}
            </a>
          }
        </div>
      </nav>
    </div>
  `,
})
export class ClinicWorkspaceComponent {
  readonly clinic = inject(ClinicConfigService);
  readonly sections = [
    { path: '/business/clinic/dashboard', label: 'Appointments', icon: 'M8 3v4m8-4v4M3 10h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z' },
    { path: '/business/clinic/patients', label: 'Patients', icon: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM5 21a7 7 0 0 1 14 0Z' },
    { path: '/business/clinic/reviews', label: 'Reviews', icon: 'M8 9h8M8 13h5M5 3h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9l-6 3V5a2 2 0 0 1 2-2Z' },
    { path: '/business/clinic/settings', label: 'Settings', icon: 'M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6M8 15v6' },
  ];
}
