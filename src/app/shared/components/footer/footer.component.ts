import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
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
  readonly brandMark = buildClinicMonogram(this.config.name, 'CL');
  readonly platformUrl = 'https://www.mydentalplatform.com';

  get showPoweredByBadge(): boolean {
    const plan = this.config.subscriptionPlan ?? 'trial';
    const status = this.config.subscriptionStatus ?? 'trial';
    return plan === 'trial' || status === 'trial';
  }

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
