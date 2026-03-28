import { ApplicationConfig, APP_INITIALIZER, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { ClinicConfigService } from './core/services/clinic-config.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    {
      provide: APP_INITIALIZER,
      useFactory: (svc: ClinicConfigService) => () => svc.loadFromFirestore(),
      deps: [ClinicConfigService],
      multi: true,
    },
  ],
};
