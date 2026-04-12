import { Component, signal, ChangeDetectionStrategy, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { AuthService } from '../../../core/services/auth.service';
import { SuperAuthService } from '../../../core/services/super-auth.service';
import { ClinicConfigService } from '../../../core/services/clinic-config.service';
import { environment } from '../../../../environments/environment';

const firebaseApp = getApps().length ? getApps()[0] : initializeApp(environment.firebase);
const fbAuth      = getAuth(firebaseApp);
const db          = getFirestore(firebaseApp);

@Component({
  selector: 'app-business-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './business-login.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessLoginComponent {
  private fb         = inject(FormBuilder);
  private auth       = inject(AuthService);
  private superAuth  = inject(SuperAuthService);
  private clinicCfg  = inject(ClinicConfigService);
  private router     = inject(Router);

  loading       = signal(false);
  googleLoading = signal(false);
  error         = signal<string | null>(null);
  showPassword  = signal(false);

  form = this.fb.nonNullable.group({
    email:    ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  isInvalid(field: string) {
    const ctrl = this.form.get(field);
    return ctrl?.invalid && ctrl?.touched;
  }

  async onSubmit() {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set(null);
    const { email, password } = this.form.getRawValue();
    try {
      const user = await this.auth.login(email, password);
      await this.routeByUserType(user.uid);
    } catch (e: unknown) {
      const code = (e as { code?: string }).code ?? '';
      if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        this.error.set('Invalid email or password.');
      } else {
        this.error.set('Sign-in failed. Please try again.');
      }
    } finally {
      this.loading.set(false);
    }
  }

  async loginWithGoogle() {
    this.googleLoading.set(true);
    this.error.set(null);
    try {
      const user = await this.auth.loginWithGoogle();
      await this.routeByUserType(user.uid);
    } catch (e: unknown) {
      const code = (e as { code?: string }).code ?? '';
      if (code?.includes('popup-closed') || code?.includes('cancelled')) return;
      this.error.set('Google sign-in failed. Please try again.');
    } finally {
      this.googleLoading.set(false);
    }
  }

  /**
   * Determines whether the signed-in user is a super-admin or a clinic owner,
   * then navigates to the right dashboard.
   * Signs the user out and shows an error if neither role matches.
   */
  private async routeByUserType(uid: string): Promise<void> {
    // 1. Super admin?
    const superSnap = await getDoc(doc(db, 'superAdmins', uid));
    if (superSnap.exists()) {
      // Explicitly update SuperAuthService so the superAdminGuard passes immediately
      this.superAuth.currentUser.set(fbAuth.currentUser);
      this.superAuth.isSuperAdmin.set(true);
      this.router.navigate(['/business/clinics']);
      return;
    }

    // 2. Clinic owner?
    const loaded = await this.clinicCfg.loadByUid(uid);
    if (loaded) {
      this.router.navigate(['/business/clinic/dashboard']);
      return;
    }

    // 3. Unknown user — sign out and explain
    await signOut(fbAuth);
    this.auth.currentUser.set(null);
    this.error.set('No admin account found for this email. Contact support.');
  }
}
