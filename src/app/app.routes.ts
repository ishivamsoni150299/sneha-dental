import { Routes } from '@angular/router';
import { adminGuard } from './core/guards/admin.guard';
import { clinicRequiredGuard } from './core/guards/clinic-required.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/home/home.component').then((m) => m.HomeComponent),
    canActivate: [clinicRequiredGuard],
  },
  {
    path: 'services',
    loadComponent: () =>
      import('./features/services/services.component').then((m) => m.ServicesComponent),
    canActivate: [clinicRequiredGuard],
  },
  {
    path: 'about',
    loadComponent: () =>
      import('./features/about/about.component').then((m) => m.AboutComponent),
    canActivate: [clinicRequiredGuard],
  },
  {
    path: 'appointment',
    loadComponent: () =>
      import('./features/appointment/appointment.component').then((m) => m.AppointmentComponent),
    canActivate: [clinicRequiredGuard],
  },
  {
    path: 'appointment/confirmed',
    loadComponent: () =>
      import('./features/appointment/confirmed/confirmed.component').then((m) => m.ConfirmedComponent),
    canActivate: [clinicRequiredGuard],
  },
  {
    path: 'my-appointment',
    loadComponent: () =>
      import('./features/my-appointment/my-appointment.component').then((m) => m.MyAppointmentComponent),
    canActivate: [clinicRequiredGuard],
  },
  {
    path: 'gallery',
    loadComponent: () =>
      import('./features/gallery/gallery.component').then((m) => m.GalleryComponent),
    canActivate: [clinicRequiredGuard],
  },
  {
    path: 'testimonials',
    loadComponent: () =>
      import('./features/testimonials/testimonials.component').then((m) => m.TestimonialsComponent),
    canActivate: [clinicRequiredGuard],
  },
  {
    path: 'contact',
    loadComponent: () =>
      import('./features/contact/contact.component').then((m) => m.ContactComponent),
    canActivate: [clinicRequiredGuard],
  },
  {
    path: 'admin/login',
    loadComponent: () =>
      import('./features/admin/admin-login/admin-login.component').then((m) => m.AdminLoginComponent),
    canActivate: [clinicRequiredGuard],
  },
  {
    path: 'admin',
    loadComponent: () =>
      import('./features/admin/admin-dashboard/admin-dashboard.component').then((m) => m.AdminDashboardComponent),
    canActivate: [clinicRequiredGuard, adminGuard],
  },
  {
    path: 'business',
    loadChildren: () =>
      import('./features/business/business.routes').then(m => m.businessRoutes),
  },
  {
    path: '**',
    loadComponent: () =>
      import('./features/not-found/not-found.component').then((m) => m.NotFoundComponent),
  },
];
