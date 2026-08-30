import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { environment } from './environments/environment';

// ── Sentry error monitoring ───────────────────────────────────────────────────
// Initialised before bootstrapApplication so every Angular error is captured.
// Only active when sentryDsn is set (non-empty string).
async function bootstrap(): Promise<void> {
  if (environment.sentryDsn) {
    try {
      const Sentry = await import('@sentry/angular');
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
    } catch (error) {
      console.error('[Sentry] Monitoring could not be initialised', error);
    }
  }

  await bootstrapApplication(AppComponent, appConfig);
}

void bootstrap().catch((err) => console.error(err));
