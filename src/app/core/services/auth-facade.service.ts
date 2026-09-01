import { Injectable, inject, signal } from '@angular/core';
import {
  createUserWithEmailAndPassword,
  getIdToken,
  GoogleAuthProvider,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, firebaseAppCheckReady } from '../firebase';
import { ClinicConfigService } from './clinic-config.service';

export type AuthRole = 'patient' | 'clinic-admin' | 'platform-admin' | 'incomplete-signup' | 'unverified';

@Injectable({ providedIn: 'root' })
export class AuthFacade {
  private readonly clinicConfig = inject(ClinicConfigService);
  private authRevision = 0;
  private readyResolved = false;
  private resolveReady!: () => void;

  readonly currentUser = signal<User | null>(null);
  readonly role = signal<AuthRole | null>(null);
  readonly ready = signal(false);
  readonly authReady = new Promise<void>(resolve => { this.resolveReady = resolve; });

  constructor() {
    onAuthStateChanged(auth, user => {
      void this.syncSession(user);
    });
  }

  get isAuthenticated(): boolean {
    return this.currentUser() !== null;
  }

  async signInWithEmail(email: string, password: string): Promise<AuthRole> {
    await firebaseAppCheckReady;
    const credential = await signInWithEmailAndPassword(auth, email, password);
    return this.resolveUser(credential.user);
  }

  async signInWithGoogle(): Promise<AuthRole> {
    await firebaseAppCheckReady;
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const credential = await signInWithPopup(auth, provider);
    return this.resolveUser(credential.user);
  }

  async createAccountWithEmail(email: string, password: string): Promise<User> {
    await firebaseAppCheckReady;
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await this.resolveUser(credential.user);
    try {
      await sendEmailVerification(credential.user, this.actionCodeSettings('/business/verify-email'));
    } catch (error) {
      console.error('[Auth] Initial verification email could not be sent:', error);
    }
    return credential.user;
  }

  async createAccountWithGoogle(): Promise<{ user: User; role: AuthRole }> {
    await firebaseAppCheckReady;
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const credential = await signInWithPopup(auth, provider);
    const role = await this.resolveUser(credential.user);
    return { user: credential.user, role };
  }

  async resendVerificationEmail(): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error('Your session has expired. Please sign in again.');
    await sendEmailVerification(user, this.actionCodeSettings('/business/verify-email'));
  }

  async refreshVerificationStatus(): Promise<AuthRole> {
    const user = auth.currentUser;
    if (!user) throw new Error('Your session has expired. Please sign in again.');
    await reload(user);
    return this.resolveUser(user);
  }

  async sendPasswordReset(email: string): Promise<void> {
    await sendPasswordResetEmail(auth, email, this.actionCodeSettings('/business/login'));
  }

  async getFreshIdToken(): Promise<string> {
    const user = auth.currentUser;
    if (!user) throw new Error('Your session has expired. Please sign in again.');
    return getIdToken(user, true);
  }

  async resolveCurrentUser(): Promise<AuthRole | null> {
    const user = auth.currentUser;
    return user ? this.resolveUser(user) : null;
  }

  async logout(): Promise<void> {
    this.authRevision += 1;
    await signOut(auth);
    this.currentUser.set(null);
    this.role.set(null);
    this.clinicConfig.resetToPlatformTheme();
  }

  private async syncSession(user: User | null): Promise<void> {
    const revision = ++this.authRevision;
    try {
      if (!user) {
        this.currentUser.set(null);
        this.role.set(null);
        return;
      }
      await this.resolveUser(user, revision);
    } catch (error) {
      if (revision === this.authRevision) {
        this.currentUser.set(user);
        this.role.set(null);
      }
      console.error('[Auth] Failed to resolve the current account:', error);
    } finally {
      if (!this.readyResolved) {
        this.readyResolved = true;
        this.ready.set(true);
        this.resolveReady();
      }
    }
  }

  private async resolveUser(user: User, expectedRevision?: number): Promise<AuthRole> {
    const revision = expectedRevision ?? ++this.authRevision;
    let role: AuthRole;

    const isPhoneOnlyPatient = !user.email &&
      Boolean(user.phoneNumber) &&
      user.providerData.some(provider => provider.providerId === 'phone');

    if (isPhoneOnlyPatient) {
      role = 'patient';
    } else if (!user.emailVerified) {
      role = 'unverified';
    } else {
      const superAdmin = await getDoc(doc(db, 'superAdmins', user.uid));
      if (superAdmin.exists()) {
        role = 'platform-admin';
      } else {
        role = await this.clinicConfig.loadByUid(user.uid)
          ? 'clinic-admin'
          : 'incomplete-signup';
      }
    }

    if (revision === this.authRevision) {
      this.currentUser.set(user);
      this.role.set(role);
    }
    return role;
  }

  private actionCodeSettings(path: string): { url: string; handleCodeInApp: false } {
    const origin = typeof window === 'undefined' ? 'https://www.mydentalplatform.com' : window.location.origin;
    return { url: `${origin}${path}`, handleCodeInApp: false };
  }
}