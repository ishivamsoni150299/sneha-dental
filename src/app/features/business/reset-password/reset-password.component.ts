import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthFacade } from '../../../core/services/auth-facade.service';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './reset-password.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetPasswordComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthFacade);
  private readonly route = inject(ActivatedRoute);

  readonly submitting = signal(false);
  readonly completed = signal(false);
  readonly error = signal<string | null>(null);
  readonly email = this.route.snapshot.queryParamMap.get('email') ?? '';
  readonly token = this.route.snapshot.queryParamMap.get('token') ?? '';
  readonly form = this.fb.nonNullable.group({
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(72)]],
    confirmation: ['', Validators.required],
  });

  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.submitting()) return;
    if (!this.email || !this.token) {
      this.error.set('This reset link is incomplete. Request a new one.');
      return;
    }
    if (this.form.controls.password.value !== this.form.controls.confirmation.value) {
      this.error.set('Passwords do not match.');
      return;
    }

    this.submitting.set(true);
    this.error.set(null);
    try {
      await this.auth.confirmPasswordReset(this.email, this.token, this.form.controls.password.value);
      this.completed.set(true);
    } catch (error) {
      const code = (error as { code?: string }).code;
      this.error.set(code === 'auth/network-request-failed'
        ? 'Check your internet connection and try again.'
        : 'This reset link is invalid or has expired. Request a new one.');
    } finally {
      this.submitting.set(false);
    }
  }
}