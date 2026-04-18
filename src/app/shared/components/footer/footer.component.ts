import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ClinicConfigService } from '../../../core/services/clinic-config.service';

const LOGO_SUFFIXES = /\s+(dental\s+care|dental\s+clinic|dental\s+center|dental\s+studio|dental\s+hub|dentistry|dental|clinic|care|center|studio|hospital|multispeciality)\s*$/i;

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

  get logoBrand(): string {
    return this.config.name.replace(LOGO_SUFFIXES, '').trim() || this.config.name;
  }

  get logoSuffix(): string {
    const m = this.config.name.match(LOGO_SUFFIXES);
    return m ? m[1].trim() : '';
  }

  get logoInitial(): string {
    const brand = this.logoBrand || this.config.name;
    const words = brand.trim().split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase();
    }
    return (words[0]?.[0] ?? '').toUpperCase();
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
