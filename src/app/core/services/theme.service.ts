import { Injectable, inject, effect } from '@angular/core';
import { ClinicConfigService } from './clinic-config.service';
import { CLINIC_THEMES } from '../config/clinic.config';

const ALL_THEMES = CLINIC_THEMES.map(theme => `theme-${theme}`);

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
