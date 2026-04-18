import { Component, signal, ChangeDetectionStrategy, inject, HostListener } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ClinicConfigService } from '../../../core/services/clinic-config.service';

/** Common dental/clinic suffixes to strip from the displayed logo name */
const LOGO_SUFFIXES = /\s+(dental\s+care|dental\s+clinic|dental\s+center|dental\s+studio|dental\s+hub|dentistry|dental|clinic|care|center|studio|hospital|multispeciality)\s*$/i;

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

  // ── Logo helpers ──────────────────────────────────────────────────────────

  /** The brand part of the name — strips common generic suffixes */
  get logoBrand(): string {
    return this.config.name.replace(LOGO_SUFFIXES, '').trim() || this.config.name;
  }

  /** The stripped suffix, e.g. "Dental" or "Dental Care" — shown small below */
  get logoSuffix(): string {
    const m = this.config.name.match(LOGO_SUFFIXES);
    return m ? m[1].trim() : '';
  }

  /**
   * 1–2 letter initial to embed inside the tooth icon.
   * - Single word brand  → first letter          e.g. "Shivam" → "S"
   * - Multi-word brand   → first letter of each  e.g. "City Care" → "CC"
   * - Falls back to first letter of full name if blank
   */
  get logoInitial(): string {
    const brand = this.logoBrand || this.config.name;
    const words = brand.trim().split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase();
    }
    return (words[0]?.[0] ?? '').toUpperCase();
  }

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
