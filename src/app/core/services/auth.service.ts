import { Injectable, signal } from '@angular/core';
import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import { environment } from '../../../environments/environment';

const firebaseApp = getApps().length ? getApps()[0] : initializeApp(environment.firebase);
const auth = getAuth(firebaseApp);

@Injectable({ providedIn: 'root' })
export class AuthService {
  currentUser = signal<User | null>(null);
  authReady    = signal(false);

  /** Resolves once the initial Firebase Auth state is known (handles page refresh). */
  readonly authReadyPromise: Promise<void>;
  private _readyResolve!: () => void;

  constructor() {
    this.authReadyPromise = new Promise(r => { this._readyResolve = r; });
    onAuthStateChanged(auth, (user) => {
      this.currentUser.set(user);
      this.authReady.set(true);
      this._readyResolve();
    });
  }

  async login(email: string, password: string): Promise<User> {
    const { user } = await signInWithEmailAndPassword(auth, email, password);
    this.currentUser.set(user);
    return user;
  }

  async loginWithGoogle(): Promise<User> {
    const provider = new GoogleAuthProvider();
    const { user } = await signInWithPopup(auth, provider);
    this.currentUser.set(user);
    return user;
  }

  async logout(): Promise<void> {
    await signOut(auth);
    this.currentUser.set(null);
  }

  get isLoggedIn(): boolean {
    return this.currentUser() !== null;
  }
}
