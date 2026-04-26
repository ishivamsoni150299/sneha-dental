import {
  ApplicationConfig,
  ErrorHandler,
  provideAppInitializer,
  inject,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter, withInMemoryScrolling, withPreloading, PreloadAllModules } from '@angular/router';
import { routes } from './app.routes';
import { ClinicConfigService } from './core/services/clinic-config.service';
import { GlobalErrorHandler } from './core/error-handler';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes,
      withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'top' }),
      withPreloading(PreloadAllModules),
    ),
    // Load clinic config from Firestore before the first component renders.
    // provideAppInitializer is the Angular 19 replacement for APP_INITIALIZER factory.
    provideAppInitializer(() => inject(ClinicConfigService).loadFromFirestore()),
    // Replace Angular's default ErrorHandler with our global one.
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
  ],
};
