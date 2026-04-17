import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { environment } from './environments/environment';
import * as Sentry from '@sentry/angular';

// ── Sentry error monitoring ───────────────────────────────────────────────────
// Initialised before bootstrapApplication so every Angular error is captured.
// Only active when sentryDsn is set (non-empty string).
if (environment.sentryDsn) {
  Sentry.init({
    dsn: environment.sentryDsn,
    environment: environment.production ? 'production' : 'development',
    // Capture 10% of transactions for performance monitoring (doesn't affect error capture).
    tracesSampleRate: 0.1,
    // Ignore noisy non-actionable errors.
    ignoreErrors: [
      'Non-Error exception captured',
      'ResizeObserver loop limit exceeded',
      'Network request failed',
    ],
  });
}

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
