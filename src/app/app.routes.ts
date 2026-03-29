import { Routes } from '@angular/router';
import { adminGuard } from './core/guards/admin.guard';
import { clinicRequiredGuard } from './core/guards/clinic-required.guard';
import { ClinicLayoutComponent } from './shared/components/clinic-layout/clinic-layout.component';

export const routes: Routes = [

  // ── Clinic-facing routes (navbar + footer + WhatsApp button) ──────────────
  {
    path: '',
    component: ClinicLayoutComponent,
    canActivate: [clinicRequiredGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./features/home/home.component').then(m => m.HomeComponent),
      },
      {
        path: 'services',
        loadComponent: () =>
          import('./features/services/services.component').then(m => m.ServicesComponent),
      },
      {
        path: 'about',
        loadComponent: () =>
          import('./features/about/about.component').then(m => m.AboutComponent),
      },
      {
        path: 'appointment',
        loadComponent: () =>
          import('./features/appointment/appointment.component').then(m => m.AppointmentComponent),
      },
      {
        path: 'appointment/confirmed',
        loadComponent: () =>
          import('./features/appointment/confirmed/confirmed.component').then(m => m.ConfirmedComponent),
      },
      {
        path: 'my-appointment',
        loadComponent: () =>
          import('./features/my-appointment/my-appointment.component').then(m => m.MyAppointmentComponent),
      },
      {
        path: 'gallery',
        loadComponent: () =>
          import('./features/gallery/gallery.component').then(m => m.GalleryComponent),
      },
      {
        path: 'testimonials',
        loadComponent: () =>
          import('./features/testimonials/testimonials.component').then(m => m.TestimonialsComponent),
      },
      {
        path: 'contact',
        loadComponent: () =>
          import('./features/contact/contact.component').then(m => m.ContactComponent),
      },
      {
        path: 'admin/login',
        loadComponent: () =>
          import('./features/admin/admin-login/admin-login.component').then(m => m.AdminLoginComponent),
      },
      {
        path: 'admin',
        loadComponent: () =>
          import('./features/admin/admin-dashboard/admin-dashboard.component').then(m => m.AdminDashboardComponent),
        canActivate: [adminGuard],
      },
    ],
  },

  // ── Platform admin panel (its own shell, no clinic navbar/footer) ─────────
  {
    path: 'business',
    loadChildren: () =>
      import('./features/business/business.routes').then(m => m.businessRoutes),
  },

  // ── 404 ───────────────────────────────────────────────────────────────────
  {
    path: '**',
    loadComponent: () =>
      import('./features/not-found/not-found.component').then(m => m.NotFoundComponent),
  },
];
