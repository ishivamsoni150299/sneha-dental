import { publicEnv } from './public-env.generated';

export const environment = {
  production: false,
  // Google Maps Platform API key — enable "Maps Embed API" and "Places API" in Google Cloud Console.
  // Restrict the key to your domains (HTTP referrers) for security.
  // Get it at: https://console.cloud.google.com/apis/credentials
  googleMapsApiKey: publicEnv.googleMapsApiKey,
  // Sentry DSN — leave empty in dev to disable error reporting locally.
  sentryDsn: publicEnv.sentryDsn,
  firebase: {
    apiKey: 'AIzaSyA_efkmE9dWE6jjyDwgE6qGMLrx_BMJEmQ',
    authDomain: 'sneha-dental-6373b.firebaseapp.com',
    projectId: 'sneha-dental-6373b',
    storageBucket: 'sneha-dental-6373b.firebasestorage.app',
    messagingSenderId: '90894209744',
    appId: '1:90894209744:web:4c4e5a17d24c1f7a0584d5',
    measurementId: 'G-6FB1LR0V8S',
  },
};
