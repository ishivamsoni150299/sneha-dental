import { Injectable, signal } from '@angular/core';
import {
  signInWithEmailAndPassword, signInWithPopup,
  GoogleAuthProvider, signOut, onAuthStateChanged, type User,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

@Injectable({ providedIn: 'root' })
export class SuperAuthService {
  readonly currentUser  = signal<User | null>(null);
  readonly isSuperAdmin = signal(false);

  /** Resolves once the initial Firebase Auth state has been determined (handles page refresh). */
  readonly authReady: Promise<void>;
  private _authReadyResolve!: () => void;

  constructor() {
    this.authReady = new Promise(resolve => { this._authReadyResolve = resolve; });

    onAuthStateChanged(auth, async user => {
      this.currentUser.set(user);
      if (user) {
        const snap = await getDoc(doc(db, 'superAdmins', user.uid));
        this.isSuperAdmin.set(snap.exists());
      } else {
        this.isSuperAdmin.set(false);
      }
      this._authReadyResolve();
    });
  }

  get isLoggedIn(): boolean {
    return this.isSuperAdmin();
  }

  async login(email: string, password: string): Promise<void> {
    const { user } = await signInWithEmailAndPassword(auth, email, password);
    await this._verifySuperAdmin(user);
  }

  async loginWithGoogle(): Promise<void> {
    const provider = new GoogleAuthProvider();
    const { user } = await signInWithPopup(auth, provider);
    await this._verifySuperAdmin(user);
  }

  private async _verifySuperAdmin(user: User): Promise<void> {
    const snap = await getDoc(doc(db, 'superAdmins', user.uid));
    if (!snap.exists()) {
      await signOut(auth);
      throw new Error('Not authorised as super admin. Contact the platform administrator.');
    }
    this.currentUser.set(user);
    this.isSuperAdmin.set(true);
  }

  async logout(): Promise<void> {
    await signOut(auth);
    this.currentUser.set(null);
    this.isSuperAdmin.set(false);
  }
}
