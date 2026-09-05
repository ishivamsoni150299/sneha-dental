import { publicEnv } from './public-env.generated';

export const environment = {
  production: true,
  googleMapsApiKey: publicEnv.googleMapsApiKey,
  // Sentry DSN — paste your project DSN from sentry.io here.
  // The DSN is safe to commit (it's included in the public JS bundle anyway).
  // Leave empty to disable error reporting.
  sentryDsn: publicEnv.sentryDsn,
};
