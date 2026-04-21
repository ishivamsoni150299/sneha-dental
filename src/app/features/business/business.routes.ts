import type { Routes } from '@angular/router';
import { superAdminGuard } from '../../core/guards/super-admin.guard';
import { clinicAdminGuard } from '../../core/guards/clinic-admin.guard';

export const businessRoutes: Routes = [
  // ── Public landing page (no auth required) ────────────────────────────────
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./platform-landing/platform-landing.component').then(m => m.PlatformLandingComponent),
    data: {
      title: 'mydentalplatform | Dental Clinic Websites, Booking and AI Reception',
      description: 'Launch a dental clinic website with online booking, WhatsApp, AI chat, and AI voice receptionist. Starter ₹999/month. Pro ₹2,499/month.',
    },
  },

  // ── Self-service clinic signup (public) ──────────────────────────────────
  {
    path: 'signup',
    loadComponent: () =>
      import('./signup/signup.component').then(m => m.SignupComponent),
    data: {
      title: 'Create Your Dental Clinic Website',
      description: 'Start your dental clinic website setup in minutes and launch with bookings, WhatsApp, and patient-ready pages.',
    },
  },

  // ── Super admin login ─────────────────────────────────────────────────────
  {
    path: 'login',
    loadComponent: () =>
      import('./business-login/business-login.component').then(m => m.BusinessLoginComponent),
    data: {
      title: 'Business Login',
      description: 'Sign in to manage clinics, leads, revenue, and settings in the mydentalplatform business portal.',
      noIndex: true,
    },
  },

  // ── Subscription expired page (accessible without active subscription) ───
  {
    path: 'clinic/expired',
    loadComponent: () =>
      import('../admin/admin-expired/admin-expired.component').then(m => m.AdminExpiredComponent),
    data: { title: 'Subscription Expired', noIndex: true },
  },

  // ── Clinic-owner admin portal (appointments + settings) ──────────────────
  {
    path: 'clinic',
    canActivate: [clinicAdminGuard],
    data: { noIndex: true },
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
      {
        path: 'doctors',
        loadComponent: () =>
          import('../admin/admin-doctors/admin-doctors.component').then(m => m.AdminDoctorsComponent),
        data: { title: 'Doctor Management', noIndex: true },
      },
      {
        path: 'patients',
        loadComponent: () =>
          import('../admin/admin-patients/admin-patients.component').then(m => m.AdminPatientsComponent),
        data: { title: 'Patient Directory', noIndex: true },
      },
    ],
  },

  // ── Protected admin shell (clinics CRUD) ──────────────────────────────────
  {
    path: '',
    canActivate: [superAdminGuard],
    loadComponent: () =>
      import('./business-shell/business-shell.component').then(m => m.BusinessShellComponent),
    data: { noIndex: true },
    children: [
      { path: '', redirectTo: 'clinics', pathMatch: 'full' },
      {
        path: 'clinics',
        loadComponent: () =>
          import('./clinic-list/clinic-list.component').then(m => m.ClinicListComponent),
        data: { title: 'Clinic Directory', noIndex: true },
      },
      {
        path: 'clinics/new',
        loadComponent: () =>
          import('./clinic-form/clinic-form.component').then(m => m.ClinicFormComponent),
        data: { title: 'Create Clinic', noIndex: true },
      },
      {
        path: 'clinics/:id/edit',
        loadComponent: () =>
          import('./clinic-form/clinic-form.component').then(m => m.ClinicFormComponent),
        data: { title: 'Edit Clinic', noIndex: true },
      },
      {
        path: 'revenue',
        loadComponent: () =>
          import('./revenue/revenue.component').then(m => m.RevenueComponent),
        data: { title: 'Revenue Dashboard', noIndex: true },
      },
      {
        path: 'analytics',
        loadComponent: () =>
          import('./analytics/analytics.component').then(m => m.AnalyticsComponent),
        data: { title: 'Business Analytics', noIndex: true },
      },
      {
        path: 'leads',
        loadComponent: () =>
          import('./leads/lead-list/lead-list.component').then(m => m.LeadListComponent),
        data: { title: 'Lead Pipeline', noIndex: true },
      },
      {
        path: 'leads/discover',
        loadComponent: () =>
          import('./leads/lead-discover/lead-discover.component').then(m => m.LeadDiscoverComponent),
        data: { title: 'Lead Discovery', noIndex: true },
      },
      {
        path: 'leads/new',
        loadComponent: () =>
          import('./leads/lead-form/lead-form.component').then(m => m.LeadFormComponent),
        data: { title: 'Create Lead', noIndex: true },
      },
      {
        path: 'leads/:id/edit',
        loadComponent: () =>
          import('./leads/lead-form/lead-form.component').then(m => m.LeadFormComponent),
        data: { title: 'Edit Lead', noIndex: true },
      },
    ],
  },
];
