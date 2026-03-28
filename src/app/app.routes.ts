import { Routes } from '@angular/router';

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
    path: '**',
    loadComponent: () =>
      import('./features/not-found/not-found.component').then((m) => m.NotFoundComponent),
  },
];
