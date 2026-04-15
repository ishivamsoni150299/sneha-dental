import { ErrorHandler, Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';

/**
 * Global uncaught-error handler.
 *
 * Catches errors that escape component try/catch and zone.js promise
 * rejections. Logs to console.error (production-safe — no console.log)
 * and redirects chunk-load failures to root so the user doesn't see a
 * blank screen after a deployment rolls out new hashed bundles.
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
  }
}
