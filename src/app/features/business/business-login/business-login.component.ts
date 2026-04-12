import { Component, signal, ChangeDetectionStrategy, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { SuperAuthService } from '../../../core/services/super-auth.service';

@Component({
  selector: 'app-business-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './business-login.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessLoginComponent {
  private fb     = inject(FormBuilder);
  private auth   = inject(SuperAuthService);
  private router = inject(Router);

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
    try {
      const { email, password } = this.form.getRawValue();
      await this.auth.login(email, password);
      this.router.navigate(['/business/clinics']);
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : '';
      this.error.set(raw.includes('super admin') ? raw : 'Invalid email or password.');
    } finally {
      this.loading.set(false);
    }
  }

  async loginWithGoogle() {
    this.googleLoading.set(true);
    this.error.set(null);
    try {
      await this.auth.loginWithGoogle();
      this.router.navigate(['/business/clinics']);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('popup-closed') || msg.includes('cancelled')) return;
      this.error.set(msg.includes('super admin') ? msg : 'Google sign-in failed. Please try again.');
    } finally {
      this.googleLoading.set(false);
    }
  }
}
