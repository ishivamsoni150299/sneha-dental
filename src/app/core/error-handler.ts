import { ErrorHandler, Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import * as Sentry from '@sentry/angular';

/**
 * Global uncaught-error handler.
 *
 * Catches errors that escape component try/catch and zone.js promise
 * rejections. Logs to console.error and forwards to Sentry when a DSN
 * is configured. Redirects chunk-load failures to root so the user doesn't
 * see a blank screen after a deployment rolls out new hashed bundles.
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly router = inject(Router);

  handleError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);

    // Lazy-chunk load failure after a new deployment — full page refresh fixes it.
    if (message.includes('ChunkLoadError') || message.includes('Loading chunk')) {
      window.location.assign('/');
      return;
    }

    console.error('[GlobalErrorHandler]', error);

    // Forward to Sentry only if it has been initialised (DSN is set).
    // Sentry.captureException is a no-op when not initialised, but the
    // explicit check avoids unnecessary overhead on every caught error.
    if (Sentry.isInitialized()) {
      Sentry.captureException(error);
    }
  }
}
