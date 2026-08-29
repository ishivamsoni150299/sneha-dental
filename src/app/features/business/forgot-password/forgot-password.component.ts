import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthFacade } from '../../../core/services/auth-facade.service';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './forgot-password.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPasswordComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthFacade);

  readonly submitting = signal(false);
  readonly submitted = signal(false);
  readonly error = signal<string | null>(null);
  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.submitting()) return;

    this.submitting.set(true);
    this.error.set(null);
    try {
      await this.auth.sendPasswordReset(this.form.controls.email.value.trim());
      this.submitted.set(true);
    } catch (error) {
      const code = (error as { code?: string }).code ?? '';
      if (code === 'auth/too-many-requests') {
        this.error.set('Too many reset requests. Wait a few minutes, then try again.');
      } else if (code === 'auth/network-request-failed') {
        this.error.set('Check your internet connection and try again.');
      } else {
        this.submitted.set(true);
      }
    } finally {
      this.submitting.set(false);
    }
  }
}