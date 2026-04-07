import { environment } from '../../../environments/environment';

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).google?.maps?.places) { resolve(); return; }
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${environment.googleMapsApiKey}&libraries=places`;
    s.onload  = () => resolve();
    s.onerror = () => { _mapsApiPromise = null; reject(new Error('Maps API load failed')); };
    document.head.appendChild(s);
  });
  return _mapsApiPromise;
}
