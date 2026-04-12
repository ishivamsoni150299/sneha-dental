import { Routes } from '@angular/router';
import { superAdminGuard } from '../../core/guards/super-admin.guard';
import { clinicAdminGuard } from '../../core/guards/clinic-admin.guard';

export const businessRoutes: Routes = [
  // ── Public landing page (no auth required) ────────────────────────────────
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./platform-landing/platform-landing.component').then(m => m.PlatformLandingComponent),
  },

  // ── Self-service clinic signup (public) ──────────────────────────────────
  {
    path: 'signup',
    loadComponent: () =>
      import('./signup/signup.component').then(m => m.SignupComponent),
  },

  // ── Super admin login ─────────────────────────────────────────────────────
  {
    path: 'login',
    loadComponent: () =>
      import('./business-login/business-login.component').then(m => m.BusinessLoginComponent),
  },

  // ── Clinic-owner admin portal (appointments + settings) ──────────────────
  {
    path: 'clinic',
    canActivate: [clinicAdminGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('../admin/admin-dashboard/admin-dashboard.component').then(m => m.AdminDashboardComponent),
        data: { title: 'Admin Dashboard', noIndex: true },
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('../admin/admin-settings/admin-settings.component').then(m => m.AdminSettingsComponent),
        data: { title: 'Clinic Settings', noIndex: true },
      },
    ],
  },

  // ── Protected admin shell (clinics CRUD) ──────────────────────────────────
  {
    path: '',
    canActivate: [superAdminGuard],
    loadComponent: () =>
      import('./business-shell/business-shell.component').then(m => m.BusinessShellComponent),
    children: [
      { path: '', redirectTo: 'clinics', pathMatch: 'full' },
      {
        path: 'clinics',
        loadComponent: () =>
          import('./clinic-list/clinic-list.component').then(m => m.ClinicListComponent),
      },
      {
        path: 'clinics/new',
        loadComponent: () =>
          import('./clinic-form/clinic-form.component').then(m => m.ClinicFormComponent),
      },
      {
        path: 'clinics/:id/edit',
        loadComponent: () =>
          import('./clinic-form/clinic-form.component').then(m => m.ClinicFormComponent),
      },
      {
        path: 'revenue',
        loadComponent: () =>
          import('./revenue/revenue.component').then(m => m.RevenueComponent),
      },
      {
        path: 'analytics',
        loadComponent: () =>
          import('./analytics/analytics.component').then(m => m.AnalyticsComponent),
      },
      {
        path: 'leads',
        loadComponent: () =>
          import('./leads/lead-list/lead-list.component').then(m => m.LeadListComponent),
      },
      {
        path: 'leads/discover',
        loadComponent: () =>
          import('./leads/lead-discover/lead-discover.component').then(m => m.LeadDiscoverComponent),
      },
      {
        path: 'leads/new',
        loadComponent: () =>
          import('./leads/lead-form/lead-form.component').then(m => m.LeadFormComponent),
      },
      {
        path: 'leads/:id/edit',
        loadComponent: () =>
          import('./leads/lead-form/lead-form.component').then(m => m.LeadFormComponent),
      },
    ],
  },
];
