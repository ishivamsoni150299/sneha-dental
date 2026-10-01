import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  selector: 'app-professional-entry', standalone: true, imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mx-auto max-w-4xl px-4 py-10 sm:py-16">
      <p class="ui-eyebrow">{{ clinic ? 'For clinics' : 'For dentists' }}</p>
      <h1 class="ui-heading mt-3">{{ clinic ? 'Manage your dental clinic' : 'Build your verified dentist profile' }}</h1>
      <p class="ui-body mt-4">{{ clinic ? 'Manage your team, appointment requests, patient records and clinic listing from one clinic workspace.' : 'Publish your qualifications and council registration, manage your availability, and receive video consultation requests after verification.' }}</p>
      <div class="mt-6 flex flex-wrap gap-3">
        <a class="ui-btn ui-btn-primary" routerLink="/account" [queryParams]="{mode: 'signup', type: clinic ? 'clinic' : 'dentist'}">{{ clinic ? 'Register your clinic' : 'Register as a dentist' }}</a>
        <a class="ui-btn ui-btn-secondary" routerLink="/account" [queryParams]="{returnUrl: clinic ? '/business/clinic/dashboard' : '/professional/workspace'}">Sign in to your workspace</a>
      </div>
      <ol class="mt-10 grid gap-5 sm:grid-cols-3">
        <li class="ui-card p-5"><h2 class="font-semibold">1. Create your account</h2><p class="ui-body mt-2">Use email and password and save your recovery code.</p></li>
        <li class="ui-card p-5"><h2 class="font-semibold">2. Complete verification</h2><p class="ui-body mt-2">Provide your council registration and practice details for review. Unverified profiles are not listed.</p></li>
        <li class="ui-card p-5"><h2 class="font-semibold">3. Publish real availability</h2><p class="ui-body mt-2">Set fees and appointment times. Review and confirm patient requests in your workspace.</p></li>
      </ol>
      <p class="ui-body mt-8">{{ clinic ? 'Practising independently?' : 'Managing a clinic team?' }} <a class="ui-link" [routerLink]="clinic ? '/professional' : '/business'">{{ clinic ? 'For dentists' : 'For clinics' }}</a></p>
    </section>
  `,
})
export class ProfessionalEntryComponent {
  readonly clinic = inject(ActivatedRoute).snapshot.data['audience'] === 'clinic';
}
