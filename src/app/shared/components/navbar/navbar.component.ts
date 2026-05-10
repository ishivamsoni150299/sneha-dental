import { NgClass } from '@angular/common';
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
  imports: [NgClass, RouterLink, RouterLinkActive],
  templateUrl: './navbar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavbarComponent {
  readonly clinic = inject(ClinicConfigService);
  readonly config = this.clinic.config;
  readonly brandMark = buildClinicMonogram(this.config.name, 'CL');
  readonly menuOpen = signal(false);
  readonly scrolled  = signal(false);

  readonly navLinks: readonly NavLink[] = [
    { label: 'Home',     route: '/',             exact: true  },
    { label: 'Services', route: '/services',     exact: false },
    { label: 'About',    route: '/about',        exact: false },
    { label: 'Gallery',  route: '/gallery',      exact: false },
    { label: 'Reviews',  route: '/testimonials', exact: false },
    { label: 'Contact',  route: '/contact',      exact: false },
  ];

  @HostListener('window:scroll')
  onScroll(): void { this.scrolled.set(window.scrollY > 24); }

  @HostListener('window:resize')
  onResize(): void {
    if (window.innerWidth >= 768) this.close();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.close(); }

  toggle(): void { this.menuOpen.update(v => !v); }
  close(): void { this.menuOpen.set(false); }

  get navShellClass(): string {
    return this.scrolled()
      ? 'bg-white shadow-lg shadow-gray-200/60 border-b border-gray-100'
      : 'bg-white border-b border-gray-100/70 shadow-sm';
  }

  get navHeightClass(): string {
    return this.scrolled() ? 'h-14' : 'h-[62px] lg:h-[68px]';
  }

  get logoImageClass(): string {
    return this.scrolled()
      ? 'h-8 max-w-[132px] sm:max-w-[140px]'
      : 'h-9 max-w-[140px] sm:h-10 sm:max-w-[160px]';
  }

  get brandMarkClass(): string {
    return this.scrolled() ? 'h-9 w-9' : 'h-9 w-9 sm:h-10 sm:w-10';
  }

  get brandNameClass(): string {
    return this.scrolled()
      ? 'text-[15px] max-w-[132px] min-[380px]:max-w-[160px] sm:max-w-[220px]'
      : 'text-[16px] max-w-[140px] min-[380px]:max-w-[180px] sm:max-w-[260px]';
  }

  get statusBadgeClass(): string {
    return this.clinic.isOpenNow
      ? 'border-green-200 bg-green-50 text-green-700'
      : 'border-gray-200 bg-gray-50 text-gray-500';
  }

  get statusDotClass(): string {
    return this.clinic.isOpenNow ? 'bg-green-500 animate-pulse' : 'bg-gray-400';
  }

  get brandStatusDotClass(): string {
    return this.clinic.isOpenNow ? 'bg-emerald-400' : 'bg-gray-300';
  }

  get bookButtonSizeClass(): string {
    return this.scrolled() ? 'px-4 py-2' : 'px-5 py-2.5';
  }

  get mobileStatusClass(): string {
    return this.clinic.isOpenNow
      ? 'bg-green-50 text-green-700 border-green-200'
      : 'bg-gray-100 text-gray-500 border-gray-200';
  }
}
