import type { Routes } from '@angular/router';
import { clinicRequiredGuard } from './core/guards/clinic-required.guard';
import { platformOnlyGuard } from './core/guards/platform-only.guard';
import { ClinicLayoutComponent } from './shared/components/clinic-layout/clinic-layout.component';

export const routes: Routes = [

  // ── Patient marketplace on the platform domain ──────────────────────────
  {
    path: 'dentists',
    canActivate: [platformOnlyGuard],
    loadComponent: () =>
      import('./features/marketplace/marketplace-layout.component').then(m => m.MarketplaceLayoutComponent),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./features/marketplace/dentist-directory.component').then(m => m.DentistDirectoryComponent),
        data: {
          title: 'Verified Dentists in Delhi NCR',
          description: 'Find verified dentists and dental clinics across Delhi NCR. Compare services, consultation fees, and clinics accepting new patients.',
        },
      },
      {
        path: ':slug/book',
        loadComponent: () =>
          import('./features/marketplace/marketplace-booking.component').then(m => m.MarketplaceBookingComponent),
        data: {
          title: 'Request Dental Appointment',
          description: 'Request a preferred appointment time with a verified dental clinic.',
          noIndex: true,
        },
      },
      {
        path: ':slug',
        loadComponent: () =>
          import('./features/marketplace/dentist-profile.component').then(m => m.DentistProfileComponent),
        data: {
          title: 'Verified Dental Clinic in Delhi NCR',
          description: 'View verified dentist details, services, consultation fees, clinic hours, and request an appointment.',
        },
      },
    ],
  },

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
        data: {
          title: 'Pain-Free Dental Care',
          description: 'Gentle, pain-free dental care with modern equipment and transparent pricing. Book your appointment today.',
        },
      },
      {
        path: 'services',
        loadComponent: () =>
          import('./features/services/services.component').then(m => m.ServicesComponent),
        data: {
          title: 'Services & Pricing',
          description: 'Explore dental treatments, transparent pricing, and health plans. Book a consultation in minutes.',
        },
      },
      {
        path: 'about',
        loadComponent: () =>
          import('./features/about/about.component').then(m => m.AboutComponent),
        data: {
          title: 'About Our Clinic',
          description: 'Meet the dentist and learn about our gentle, patient-first approach to dental care.',
        },
      },
      {
        path: 'appointment',
        loadComponent: () =>
          import('./features/appointment/appointment.component').then(m => m.AppointmentComponent),
        data: {
          title: 'Book Appointment',
          description: 'Request your preferred date and time. Same-day appointments often available.',
        },
      },
      {
        path: 'appointment/confirmed',
        loadComponent: () =>
          import('./features/appointment/confirmed/confirmed.component').then(m => m.ConfirmedComponent),
        data: {
          title: 'Appointment Request Received',
          description: 'Your appointment request was received. Save your booking reference for future changes.',
          noIndex: true,
        },
      },
      {
        path: 'my-appointment',
        loadComponent: () =>
          import('./features/my-appointment/my-appointment.component').then(m => m.MyAppointmentComponent),
        data: {
          title: 'Manage Appointment',
          description: 'View, reschedule, or cancel your appointment with your booking reference.',
          noIndex: true,
        },
      },
      {
        path: 'gallery',
        loadComponent: () =>
          import('./features/gallery/gallery.component').then(m => m.GalleryComponent),
        data: {
          title: 'Clinic Gallery',
          description: 'See photos of our clinic, equipment, and patient-friendly spaces.',
        },
      },
      {
        path: 'testimonials',
        loadComponent: () =>
          import('./features/testimonials/testimonials.component').then(m => m.TestimonialsComponent),
        data: {
          title: 'Patient Testimonials',
          description: 'Real reviews from patients who trusted us with their smiles.',
        },
      },
      {
        path: 'contact',
        loadComponent: () =>
          import('./features/contact/contact.component').then(m => m.ContactComponent),
        data: {
          title: 'Contact Us',
          description: 'Call, WhatsApp, or message us. We respond quickly during clinic hours.',
        },
      },
      {
        path: 'privacy',
        loadComponent: () =>
          import('./features/legal/legal.component').then(m => m.LegalComponent),
        data: {
          title: 'Privacy Notice',
          description: 'Learn how appointment and enquiry information is handled on this clinic website.',
          legalPage: 'privacy',
        },
      },
      {
        path: 'terms',
        loadComponent: () =>
          import('./features/legal/legal.component').then(m => m.LegalComponent),
        data: {
          title: 'Website Terms',
          description: 'Terms for online appointment requests and use of this clinic website.',
          legalPage: 'terms',
        },
      },
      // ── Admin has moved to mydentalplatform.com/business/login ──────────
      // These redirects preserve old bookmarks gracefully.
      { path: 'admin/login',    redirectTo: '/business/login' },
      { path: 'admin/settings', redirectTo: '/business/clinic/settings' },
      { path: 'admin',          redirectTo: '/business/clinic/dashboard' },
    ],
  },

  // ── Platform admin panel (its own shell, no clinic navbar/footer) ─────────
  {
    path: 'business',
    canActivate: [platformOnlyGuard],
    loadChildren: () =>
      import('./features/business/business.routes').then(m => m.businessRoutes),
  },

  // ── Internal platform staff access ───────────────────────────────────────
  {
    path: 'platform/login',
    canActivate: [platformOnlyGuard],
    loadComponent: () =>
      import('./features/business/login/login.component').then(m => m.LoginComponent),
    data: {
      title: 'Platform Staff Access',
      description: 'Restricted access for authorised mydentalplatform staff.',
      portal: 'platform',
      noIndex: true,
    },
  },

  // ── Coming Soon (full-page, no clinic navbar) ─────────────────────────────
  {
    path: 'coming-soon',
    loadComponent: () =>
      import('./features/coming-soon/coming-soon.component').then(m => m.ComingSoonComponent),
    data: {
      title: 'Launching Soon',
      description: 'Our dental clinic website is launching very soon. Get notified on WhatsApp.',
      noIndex: true,
    },
  },

  // ── 404 ───────────────────────────────────────────────────────────────────
  {
    path: '**',
    loadComponent: () =>
      import('./features/not-found/not-found.component').then(m => m.NotFoundComponent),
    data: {
      title: 'Page Not Found',
      description: 'The page you are looking for does not exist.',
      noIndex: true,
    },
  },
];
