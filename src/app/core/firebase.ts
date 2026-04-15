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
