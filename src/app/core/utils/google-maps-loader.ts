import { environment } from '../../../environments/environment';

// Minimal typing for the Google Maps global — avoids importing the full @types/google.maps package.
declare global {
  interface Window {
    google?: {
      maps?: {
        places?: unknown;
      };
    };
  }
}

let _mapsApiPromise: Promise<void> | null = null;

export function hasGoogleMapsKey(): boolean {
  return !!environment.googleMapsApiKey;
}

export function loadGoogleMapsScript(): Promise<void> {
  if (!environment.googleMapsApiKey) {
    return Promise.reject(new Error('NO_API_KEY'));
  }
  if (_mapsApiPromise) return _mapsApiPromise;
  _mapsApiPromise = new Promise((resolve, reject) => {
    if (window.google?.maps?.places) { resolve(); return; }
    const s = document.createElement('script');
    s.src     = `https://maps.googleapis.com/maps/api/js?key=${environment.googleMapsApiKey}&libraries=places`;
    s.onload  = (): void => resolve();
    s.onerror = (): void => { _mapsApiPromise = null; reject(new Error('Maps API load failed')); };
    document.head.appendChild(s);
  });
  return _mapsApiPromise;
}
