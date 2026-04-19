import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ClinicConfigService } from '../../../core/services/clinic-config.service';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './footer.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FooterComponent {
  readonly clinic = inject(ClinicConfigService);
  readonly config = this.clinic.config;
  readonly year   = new Date().getFullYear();
  readonly contactEmail = this.config.billingEmail?.trim() ?? '';

  quickLinks = [
    { label: 'Home',             route: '/' },
    { label: 'Services',         route: '/services' },
    { label: 'About Us',         route: '/about' },
    { label: 'Gallery',          route: '/gallery' },
    { label: 'Testimonials',     route: '/testimonials' },
    { label: 'Contact',          route: '/contact' },
    { label: 'Book Appointment', route: '/appointment' },
  ];
}
