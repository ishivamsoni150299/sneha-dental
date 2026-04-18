import { Component, signal, ChangeDetectionStrategy, inject, HostListener } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ClinicConfigService } from '../../../core/services/clinic-config.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './navbar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavbarComponent {
  readonly config = inject(ClinicConfigService).config;
  menuOpen = signal(false);
  scrolled  = signal(false);

  navLinks = [
    { label: 'Home',     route: '/',             exact: true  },
    { label: 'Services', route: '/services',     exact: false },
    { label: 'About',    route: '/about',        exact: false },
    { label: 'Gallery',  route: '/gallery',      exact: false },
    { label: 'Reviews',  route: '/testimonials', exact: false },
    { label: 'Contact',  route: '/contact',      exact: false },
  ];

  @HostListener('window:scroll')
  onScroll() { this.scrolled.set(window.scrollY > 24); }

  toggle() { this.menuOpen.update(v => !v); }
  close()  { this.menuOpen.set(false); }
}
