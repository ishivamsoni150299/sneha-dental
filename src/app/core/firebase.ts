/**
 * Single source of Firebase initialization for the entire Angular app.
 * Import `firebaseApp`, `db`, and `auth` from here — never call
 * initializeApp() or getFirestore() directly in services.
 */
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { environment } from '../../environments/environment';

export const firebaseApp =
  getApps().length > 0 ? getApp() : initializeApp(environment.firebase);

export const db   = getFirestore(firebaseApp);
export const auth = getAuth(firebaseApp);

let appCheckInstance: import('firebase/app-check').AppCheck | null = null;

export const firebaseAppCheckReady = initializeFirebaseAppCheck();

export async function getFirebaseAppCheckToken(): Promise<string | null> {
  const instance = await firebaseAppCheckReady;
  if (!instance) return null;

  const { getToken } = await import('firebase/app-check');
  return (await getToken(instance)).token;
}

async function initializeFirebaseAppCheck(): Promise<import('firebase/app-check').AppCheck | null> {
  if (typeof window === 'undefined' || !environment.firebaseAppCheckSiteKey) return null;
  if (appCheckInstance) return appCheckInstance;

  const { initializeAppCheck, ReCaptchaV3Provider } = await import('firebase/app-check');
  appCheckInstance = initializeAppCheck(firebaseApp, {
    provider: new ReCaptchaV3Provider(environment.firebaseAppCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
  return appCheckInstance;
}
