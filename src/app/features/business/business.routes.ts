import { Routes } from '@angular/router';
import { superAdminGuard } from '../../core/guards/super-admin.guard';

export const businessRoutes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./business-login/business-login.component').then(m => m.BusinessLoginComponent),
  },
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
    ],
  },
];
