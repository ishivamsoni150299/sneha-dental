import { ChangeDetectionStrategy, Component, HostListener, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ClinicConfigService } from '../../../core/services/clinic-config.service';
import { buildClinicMonogram } from '../../../core/utils/clinic-branding';

interface NavLink {
  label: string;
  route: string;
  exact: boolean;
}

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './navbar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavbarComponent {
  readonly clinic = inject(ClinicConfigService);
  readonly config = this.clinic.config;
  readonly brandMark = buildClinicMonogram(this.clinic.displayName, 'DC');
  readonly menuOpen = signal(false);

  readonly navLinks: readonly NavLink[] = [
    { label: 'Home',     route: '/',             exact: true  },
    { label: 'Services', route: '/services',     exact: false },
    { label: 'About',    route: '/about',        exact: false },
    { label: 'Gallery',  route: '/gallery',      exact: false },
    { label: 'Reviews',  route: '/testimonials', exact: false },
    { label: 'Contact',  route: '/contact',      exact: false },
  ];

  readonly mobileNavLinks: readonly NavLink[] = [
    { label: 'Services', route: '/services',     exact: false },
    { label: 'About',    route: '/about',        exact: false },
    { label: 'Reviews',  route: '/testimonials', exact: false },
    { label: 'Contact',  route: '/contact',      exact: false },
  ];

  @HostListener('window:resize')
  onResize(): void {
    if (window.innerWidth >= 768) this.close();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.close(); }

  toggle(): void { this.menuOpen.update(v => !v); }
  close(): void { this.menuOpen.set(false); }

}
