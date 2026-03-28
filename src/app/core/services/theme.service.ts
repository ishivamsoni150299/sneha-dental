import { Injectable, inject } from '@angular/core';
import { ClinicConfigService } from './clinic-config.service';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  constructor() {
    const theme = inject(ClinicConfigService).config.theme;
    document.documentElement.classList.add(`theme-${theme}`);
  }
}
