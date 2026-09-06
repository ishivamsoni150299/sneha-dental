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
          title: 'Find & Book Dentists Near You in Delhi NCR',
          description: 'Search by dental problem and location, compare verified dentists, view consultation fees and availability, and request an appointment online.',
        },
      },
      {
        path: 'noida',
        loadComponent: () => import('./features/marketplace/dentist-directory.component').then(m => m.DentistDirectoryComponent),
        data: { title: 'Best Dentists in Noida', description: 'Find verified dentists in Noida, compare fees and check live appointment availability.', initialLocation: 'Noida' },
      },
      {
        path: 'delhi',
        loadComponent: () => import('./features/marketplace/dentist-directory.component').then(m => m.DentistDirectoryComponent),
        data: { title: 'Best Dentists in Delhi', description: 'Find verified dentists in Delhi, compare fees and check live appointment availability.', initialLocation: 'Delhi' },
      },
      {
        path: 'gurugram',
        loadComponent: () => import('./features/marketplace/dentist-directory.component').then(m => m.DentistDirectoryComponent),
        data: { title: 'Best Dentists in Gurugram', description: 'Find verified dentists in Gurugram, compare fees and check live appointment availability.', initialLocation: 'Gurugram' },
      },
      {
        path: 'ghaziabad',
        loadComponent: () => import('./features/marketplace/dentist-directory.component').then(m => m.DentistDirectoryComponent),
        data: { title: 'Best Dentists in Ghaziabad', description: 'Find verified dentists in Ghaziabad, compare fees and check live appointment availability.', initialLocation: 'Ghaziabad' },
      },
      {
        path: 'faridabad',
        loadComponent: () => import('./features/marketplace/dentist-directory.component').then(m => m.DentistDirectoryComponent),
        data: { title: 'Best Dentists in Faridabad', description: 'Find verified dentists in Faridabad, compare fees and check live appointment availability.', initialLocation: 'Faridabad' },
      },
      {
        path: 'noida/sector-75',
        loadComponent: () => import('./features/marketplace/dentist-directory.component').then(m => m.DentistDirectoryComponent),
        data: { title: 'Dentists in Sector 75, Noida', description: 'Find verified dentists near Sector 75, Noida and book an available appointment.', initialLocation: 'Sector 75' },
      },
      {
        path: 'root-canal/noida',
        loadComponent: () => import('./features/marketplace/dentist-directory.component').then(m => m.DentistDirectoryComponent),
        data: { title: 'Root Canal Dentists in Noida', description: 'Find verified root canal dentists in Noida, compare fees and book an appointment.', initialLocation: 'Noida', initialServiceId: 'root-canal' },
      },
      {
        path: 'dental-implants/delhi',
        loadComponent: () => import('./features/marketplace/dentist-directory.component').then(m => m.DentistDirectoryComponent),
        data: { title: 'Dental Implant Dentists in Delhi', description: 'Find verified dental implant dentists in Delhi, compare fees and book an appointment.', initialLocation: 'Delhi', initialServiceId: 'dental-implants' },
      },
      {
        path: 'braces/delhi',
        loadComponent: () => import('./features/marketplace/dentist-directory.component').then(m => m.DentistDirectoryComponent),
        data: { title: 'Braces Dentists in Delhi', description: 'Find verified orthodontists in Delhi, compare fees and book an appointment.', initialLocation: 'Delhi', initialServiceId: 'braces-orthodontics' },
      },
      {
        path: 'root-canal/delhi',
        loadComponent: () => import('./features/marketplace/dentist-directory.component').then(m => m.DentistDirectoryComponent),
        data: { title: 'Root Canal Dentists in Delhi', description: 'Find verified root canal specialists in Delhi, compare rotary endodontic fees and book an appointment.', initialLocation: 'Delhi', initialServiceId: 'root-canal' },
      },
      {
        path: 'root-canal/gurugram',
        loadComponent: () => import('./features/marketplace/dentist-directory.component').then(m => m.DentistDirectoryComponent),
        data: { title: 'Root Canal Dentists in Gurugram', description: 'Find verified root canal dentists in Gurugram, compare fees and book an appointment.', initialLocation: 'Gurugram', initialServiceId: 'root-canal' },
      },
      {
        path: 'dental-implants/noida',
        loadComponent: () => import('./features/marketplace/dentist-directory.component').then(m => m.DentistDirectoryComponent),
        data: { title: 'Dental Implant Dentists in Noida', description: 'Find certified dental implantologists in Noida, compare tooth implant pricing and book a consultation.', initialLocation: 'Noida', initialServiceId: 'dental-implants' },
      },
      {
        path: 'dental-implants/gurugram',
        loadComponent: () => import('./features/marketplace/dentist-directory.component').then(m => m.DentistDirectoryComponent),
        data: { title: 'Dental Implant Dentists in Gurugram', description: 'Find verified dental implant clinics in Gurugram, compare pricing and book an appointment.', initialLocation: 'Gurugram', initialServiceId: 'dental-implants' },
      },
      {
        path: 'braces/noida',
        loadComponent: () => import('./features/marketplace/dentist-directory.component').then(m => m.DentistDirectoryComponent),
        data: { title: 'Braces & Aligners in Noida', description: 'Find verified orthodontists in Noida, compare metal, ceramic braces and clear aligners fees.', initialLocation: 'Noida', initialServiceId: 'braces-orthodontics' },
      },
      {
        path: 'teeth-whitening/delhi',
        loadComponent: () => import('./features/marketplace/dentist-directory.component').then(m => m.DentistDirectoryComponent),
        data: { title: 'Teeth Whitening Dentists in Delhi', description: 'Find verified cosmetic dentists in Delhi offering professional laser and in-office teeth whitening.', initialLocation: 'Delhi', initialServiceId: 'teeth-whitening' },
      },
      {
        path: 'teeth-whitening/noida',
        loadComponent: () => import('./features/marketplace/dentist-directory.component').then(m => m.DentistDirectoryComponent),
        data: { title: 'Teeth Whitening Dentists in Noida', description: 'Find verified cosmetic dentists in Noida offering professional teeth whitening and bleaching.', initialLocation: 'Noida', initialServiceId: 'teeth-whitening' },
      },
      {
        path: 'cleaning-scaling/delhi',
        loadComponent: () => import('./features/marketplace/dentist-directory.component').then(m => m.DentistDirectoryComponent),
        data: { title: 'Teeth Cleaning & Scaling in Delhi', description: 'Find verified dental clinics in Delhi offering deep teeth scaling and polishing.', initialLocation: 'Delhi', initialServiceId: 'cleaning-scaling' },
      },
      {
        path: 'cleaning-scaling/noida',
        loadComponent: () => import('./features/marketplace/dentist-directory.component').then(m => m.DentistDirectoryComponent),
        data: { title: 'Teeth Cleaning & Scaling in Noida', description: 'Find verified dental clinics in Noida offering ultrasonic scaling, stain removal, and polishing.', initialLocation: 'Noida', initialServiceId: 'cleaning-scaling' },
      },
      {
        path: 'emergency/delhi',
        loadComponent: () => import('./features/marketplace/dentist-directory.component').then(m => m.DentistDirectoryComponent),
        data: { title: 'Emergency Dentists in Delhi', description: 'Find verified emergency dental clinics in Delhi with same-day appointments for acute toothache relief.', initialLocation: 'Delhi', initialServiceId: 'emergency-dental-care' },
      },
      {
        path: 'emergency/noida',
        loadComponent: () => import('./features/marketplace/dentist-directory.component').then(m => m.DentistDirectoryComponent),
        data: { title: 'Emergency Dentists in Noida', description: 'Find verified emergency dental clinics in Noida with same-day appointments for urgent dental care.', initialLocation: 'Noida', initialServiceId: 'emergency-dental-care' },
      },
      {
        path: 'delhi/south-delhi',
        loadComponent: () => import('./features/marketplace/dentist-directory.component').then(m => m.DentistDirectoryComponent),
        data: { title: 'Dentists in South Delhi', description: 'Find top-rated verified dentists in South Delhi including South Extension, GK, and Saket.', initialLocation: 'South Delhi' },
      },
      {
        path: 'gurugram/cyber-city',
        loadComponent: () => import('./features/marketplace/dentist-directory.component').then(m => m.DentistDirectoryComponent),
        data: { title: 'Dentists in Cyber City, Gurugram', description: 'Find verified dental clinics near DLF Cyber City and Golf Course Road, Gurugram.', initialLocation: 'Cyber City' },
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
  {
    path: 'dentist',
    canActivate: [platformOnlyGuard],
    loadComponent: () =>
      import('./features/marketplace/marketplace-layout.component').then(m => m.MarketplaceLayoutComponent),
    children: [
      {
        path: ':slug',
        loadComponent: () =>
          import('./features/marketplace/dentist-profile.component').then(m => m.DentistProfileComponent),
        data: {
          title: 'Verified Dentist Profile',
          description: 'View qualifications, treatments, fees, clinic information, patient reviews and appointment availability.',
        },
      },
    ],
  },
  {
    path: 'clinic',
    canActivate: [platformOnlyGuard],
    loadComponent: () =>
      import('./features/marketplace/marketplace-layout.component').then(m => m.MarketplaceLayoutComponent),
    children: [
      {
        path: ':slug',
        loadComponent: () =>
          import('./features/marketplace/dentist-profile.component').then(m => m.DentistProfileComponent),
        data: {
          title: 'Verified Dental Clinic Profile',
          description: 'View clinic photos, location, dentists, treatments, fees, reviews and appointment availability.',
        },
      },
    ],
  },
  {
    path: 'appointments',
    canActivate: [platformOnlyGuard],
    loadComponent: () =>
      import('./features/marketplace/marketplace-layout.component').then(m => m.MarketplaceLayoutComponent),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./features/marketplace/patient-appointments.component').then(m => m.PatientAppointmentsComponent),
        data: {
          title: 'My Dental Appointments',
          description: 'Verify your mobile number to securely manage dental appointment requests.',
          noIndex: true,
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
