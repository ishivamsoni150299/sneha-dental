import { publicEnv } from './public-env.generated';

export const environment = {
  production: false,
  // Google Maps Platform API key — enable "Maps Embed API" and "Places API" in Google Cloud Console.
  // Restrict the key to your domains (HTTP referrers) for security.
  // Get it at: https://console.cloud.google.com/apis/credentials
  googleMapsApiKey: publicEnv.googleMapsApiKey,
  // Sentry DSN — leave empty in dev to disable error reporting locally.
  sentryDsn: publicEnv.sentryDsn,
};
