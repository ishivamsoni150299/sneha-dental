import { publicEnv } from './public-env.generated';

export const environment = {
  production: true,
  googleMapsApiKey: publicEnv.googleMapsApiKey,
  // Sentry DSN — paste your project DSN from sentry.io here.
  // The DSN is safe to commit (it's included in the public JS bundle anyway).
  // Leave empty to disable error reporting.
  sentryDsn: publicEnv.sentryDsn,
  firebase: {
    apiKey: 'AIzaSyA_efkmE9dWE6jjyDwgE6qGMLrx_BMJEmQ',
    authDomain: 'mydentalplatform.com',
    projectId: 'sneha-dental-6373b',
    storageBucket: 'sneha-dental-6373b.firebasestorage.app',
    messagingSenderId: '90894209744',
    appId: '1:90894209744:web:4c4e5a17d24c1f7a0584d5',
    measurementId: 'G-6FB1LR0V8S',
  },
};
