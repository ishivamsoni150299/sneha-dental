import { Routes } from '@angular/router';
import { adminGuard } from './core/guards/admin.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/home/home.component').then((m) => m.HomeComponent),
  },
  {
    path: 'services',
    loadComponent: () =>
      import('./features/services/services.component').then((m) => m.ServicesComponent),
  },
  {
    path: 'about',
    loadComponent: () =>
      import('./features/about/about.component').then((m) => m.AboutComponent),
  },
  {
    path: 'appointment',
    loadComponent: () =>
      import('./features/appointment/appointment.component').then((m) => m.AppointmentComponent),
  },
  {
    path: 'my-appointment',
    loadComponent: () =>
      import('./features/my-appointment/my-appointment.component').then((m) => m.MyAppointmentComponent),
  },
  {
    path: 'gallery',
    loadComponent: () =>
      import('./features/gallery/gallery.component').then((m) => m.GalleryComponent),
  },
  {
    path: 'testimonials',
    loadComponent: () =>
      import('./features/testimonials/testimonials.component').then((m) => m.TestimonialsComponent),
  },
  {
    path: 'contact',
    loadComponent: () =>
      import('./features/contact/contact.component').then((m) => m.ContactComponent),
  },
  {
    path: 'admin/login',
    loadComponent: () =>
      import('./features/admin/admin-login/admin-login.component').then((m) => m.AdminLoginComponent),
  },
  {
    path: 'admin',
    loadComponent: () =>
      import('./features/admin/admin-dashboard/admin-dashboard.component').then((m) => m.AdminDashboardComponent),
    canActivate: [adminGuard],
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
