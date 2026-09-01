import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { clinicHasPlatformFeature } from '../../../core/config/clinic.config';
import { ClinicConfigService } from '../../../core/services/clinic-config.service';
import { buildClinicMonogram } from '../../../core/utils/clinic-branding';

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
  readonly brandMark = buildClinicMonogram(this.clinic.displayName, 'DC');
  readonly platformUrl = 'https://www.mydentalplatform.com';

  get showPoweredByBadge(): boolean {
    return !clinicHasPlatformFeature(this.config, 'removePlatformBranding');
  }

  readonly quickLinks = [
    { label: 'Home',             route: '/' },
    { label: 'Services',         route: '/services' },
    { label: 'About Us',         route: '/about' },
    { label: 'Gallery',          route: '/gallery' },
    { label: 'Testimonials',     route: '/testimonials' },
    { label: 'Contact',          route: '/contact' },
    { label: 'Book Appointment', route: '/appointment' },
  ];
}
