import { Injectable, inject, effect } from '@angular/core';
import { ClinicConfigService } from './clinic-config.service';

const ALL_THEMES = ['theme-blue', 'theme-teal', 'theme-caramel', 'theme-emerald', 'theme-purple', 'theme-rose'];

@Injectable({ providedIn: 'root' })
export class ThemeService {
  constructor() {
    const clinic = inject(ClinicConfigService);
    effect(() => {
      if (typeof document === 'undefined') return;
      const theme = clinic.config.theme;
      const html  = document.documentElement;
      html.classList.remove(...ALL_THEMES);
      if (theme) html.classList.add(`theme-${theme}`);
    });
  }
}
