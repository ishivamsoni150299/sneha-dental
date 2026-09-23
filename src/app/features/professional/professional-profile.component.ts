import { ChangeDetectionStrategy, Component, OnInit, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthenticatedApiService } from '../../core/services/authenticated-api.service';

interface ProviderProfile {
  fullName: string;
  qualification: string | null;
  speciality: string | null;
  biography: string | null;
  experienceYears: number | null;
  registrationNumber: string | null;
  registrationCouncil: string | null;
  phoneE164: string | null;
  photoUrl: string | null;
  languages: string[];
  verificationStatus: string;
  verificationReason?: string | null;
  locations: Array<{ id: string; name: string; city: string; status: string }>;
}

@Component({
  selector: 'app-professional-profile',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (embedded()) {
      <section class="mt-5" aria-label="Dentist profile setup">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div><h2 class="text-xl font-bold text-gray-950">Your profile</h2><p class="mt-1 text-sm text-gray-600">Add your credentials and practice here. Set hours in the next tab.</p></div>
          @if (profile()) { <span class="rounded-full px-3 py-1.5 text-sm font-bold" [class]="profile()!.verificationStatus === 'verified' ? 'bg-green-100 text-green-800' : profile()!.verificationStatus === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-gray-200 text-gray-700'">{{ profile()!.verificationStatus }}</span> }
        </div>
        @if (profile()?.verificationStatus === 'rejected' && profile()?.verificationReason) { <p class="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-800" role="status">Verification rejected: {{ profile()?.verificationReason }}. Update your details and submit again.</p> }
        @if (message()) { <p class="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-900" role="status">{{ message() }}</p> }
        @if (error()) { <p class="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800" role="alert">{{ error() }}</p> }
        @if (loading()) { <p class="mt-8 text-sm text-gray-600">Loading your profile…</p> }
        @else {
          <div class="mt-5 grid gap-5 lg:grid-cols-[1.35fr_0.9fr]">
            <form [formGroup]="profileForm" (ngSubmit)="saveProfile()" class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
              <h3 class="text-lg font-bold text-gray-950">1. Professional details</h3>
              <p class="mt-1 text-sm text-gray-600">Save these before submitting for verification.</p>
              <div class="mt-5 grid gap-4 sm:grid-cols-2">
                <label class="text-sm font-semibold">Full name<input formControlName="fullName" required class="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-2.5"></label>
                <label class="text-sm font-semibold">Qualification<input formControlName="qualification" required class="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-2.5" placeholder="BDS"></label>
                <label class="text-sm font-semibold">Speciality<input formControlName="speciality" required class="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-2.5" placeholder="General dentistry"></label>
                <label class="text-sm font-semibold">Registration number<input formControlName="registrationNumber" required class="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-2.5"></label>
                <label class="text-sm font-semibold sm:col-span-2">Registration council<input formControlName="registrationCouncil" required class="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-2.5" placeholder="Your state dental council"></label>
              </div>
              <details class="mt-5 rounded-xl border border-gray-200 p-4">
                <summary class="cursor-pointer text-sm font-semibold text-blue-700">Optional profile details</summary>
                <div class="mt-4 grid gap-4 sm:grid-cols-2">
                  <label class="text-sm font-semibold">Experience in years<input formControlName="experienceYears" type="number" min="0" max="80" class="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-2.5"></label>
                  <label class="text-sm font-semibold">Phone in international format<input formControlName="phoneE164" class="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-2.5" placeholder="+919876543210"></label>
                  <label class="text-sm font-semibold sm:col-span-2">Languages<input formControlName="languages" class="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-2.5" placeholder="Hindi, English"></label>
                  <label class="text-sm font-semibold sm:col-span-2">Biography<textarea formControlName="biography" rows="3" class="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-2.5"></textarea></label>
                </div>
              </details>
              <button class="mt-5 rounded-xl bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-700 disabled:opacity-60" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save professional details' }}</button>
            </form>
            <div class="space-y-5">
              <section class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                <h3 class="text-lg font-bold text-gray-950">2. Practice location</h3>
                @if (profile()?.locations?.length) { <ul class="mt-4 space-y-2">@for (location of profile()!.locations; track location.id) { <li class="rounded-xl border border-gray-200 p-3"><p class="font-bold text-gray-900">{{ location.name }}</p><p class="text-sm text-gray-600">{{ location.city }} · {{ location.status }}</p></li> }</ul> }
                @else { <p class="mt-2 text-sm text-gray-600">Add where patients can book you.</p> }
                <form [formGroup]="locationForm" (ngSubmit)="addLocation()" class="mt-4 space-y-3 border-t border-gray-200 pt-4">
                  <label class="block text-sm font-semibold">Practice or clinic name<input formControlName="name" required class="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5"></label>
                  <label class="block text-sm font-semibold">Street address<input formControlName="addressLine1" required class="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5"></label>
                  <div class="grid grid-cols-2 gap-3"><label class="text-sm font-semibold">Locality<input formControlName="locality" class="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5"></label><label class="text-sm font-semibold">City<input formControlName="city" required class="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5"></label></div>
                  <label class="block text-sm font-semibold">Consultation fee (₹)<input formControlName="consultationFee" type="number" min="0" required class="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5"></label>
                  <button class="w-full rounded-xl border border-blue-600 px-4 py-2.5 font-bold text-blue-700">Add practice and set hours →</button>
                </form>
              </section>
              <section class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                <h3 class="text-lg font-bold">3. Verification</h3>
                <p class="mt-2 text-sm leading-6 text-gray-600">After saving your details, adding a practice and setting hours, submit for review. Your profile appears to patients once approved.</p>
                @if (!hasHours() && profile()?.verificationStatus !== 'verified') { <p class="mt-2 text-sm font-semibold text-amber-800">Set at least one bookable day in Hours to enable submission.</p> }
                <button (click)="submitVerification()" class="mt-4 w-full rounded-xl bg-gray-950 px-4 py-3 font-bold text-white disabled:opacity-50" [disabled]="!canSubmitVerification()">Submit for verification</button>
              </section>
            </div>
          </div>
        }
      </section>
    }
  `,
})
export class ProfessionalProfileComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(AuthenticatedApiService);
  private readonly router = inject(Router);
  readonly embedded = input(false);
  readonly hasHours = input(false);
  readonly locationAdded = output<void>();
  readonly profile = signal<ProviderProfile | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly profileForm = this.fb.nonNullable.group({ fullName: ['', Validators.required], qualification: ['', Validators.required], speciality: ['', Validators.required], biography: [''], experienceYears: [0], registrationNumber: ['', Validators.required], registrationCouncil: ['', Validators.required], phoneE164: [''], languages: [''] });
  readonly locationForm = this.fb.nonNullable.group({ name: ['', Validators.required], addressLine1: ['', Validators.required], locality: [''], city: ['', Validators.required], consultationFee: [0, [Validators.required, Validators.min(0)]] });

  async ngOnInit(): Promise<void> {
    if (!this.embedded()) { await this.router.navigateByUrl('/professional/workspace?tab=profile', { replaceUrl: true }); return; }
    await this.load();
  }
  canSubmitVerification(): boolean {
    const p = this.profile();
    return !!p && this.hasHours() && !['pending', 'verified'].includes(p.verificationStatus) && !!p.qualification?.trim() && !!p.speciality?.trim() && !!p.registrationNumber?.trim() && !!p.registrationCouncil?.trim() && p.locations.length > 0;
  }
  async load(): Promise<void> {
    this.loading.set(true); this.error.set(null);
    try {
      const r = await this.api.fetch('/api/providers/me');
      if (!r.ok) throw new Error('Could not load profile.');
      const p = await r.json() as ProviderProfile;
      this.profile.set(p);
      this.profileForm.patchValue({ fullName: p.fullName, qualification: p.qualification ?? '', speciality: p.speciality ?? '', biography: p.biography ?? '', experienceYears: p.experienceYears ?? 0, registrationNumber: p.registrationNumber ?? '', registrationCouncil: p.registrationCouncil ?? '', phoneE164: p.phoneE164 ?? '', languages: (p.languages ?? []).join(', ') });
    } catch (error) { this.error.set((error as Error).message); }
    finally { this.loading.set(false); }
  }
  async saveProfile(): Promise<void> {
    this.profileForm.markAllAsTouched();
    if (this.profileForm.invalid || this.saving()) return;
    this.saving.set(true); this.error.set(null);
    try {
      const v = this.profileForm.getRawValue();
      const r = await this.api.fetch('/api/providers/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...v, languages: v.languages.split(',').map(x => x.trim()).filter(Boolean), photoUrl: this.profile()?.photoUrl ?? '' }) });
      if (!r.ok) throw new Error('Could not save profile.');
      await this.load(); this.message.set('Professional details saved.');
    } catch (error) { this.error.set((error as Error).message); }
    finally { this.saving.set(false); }
  }
  async addLocation(): Promise<void> {
    this.locationForm.markAllAsTouched();
    if (this.locationForm.invalid) return;
    this.error.set(null);
    try {
      const v = this.locationForm.getRawValue();
      const r = await this.api.fetch('/api/providers/me/locations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...v, addressLine2: '', state: '', postalCode: '', phoneE164: '', acceptingNewPatients: true, schedule: {} }) });
      if (!r.ok) throw new Error('Could not add location.');
      this.locationForm.reset({ name: '', addressLine1: '', locality: '', city: '', consultationFee: 0 });
      await this.load(); this.locationAdded.emit();
    } catch (error) { this.error.set((error as Error).message); }
  }
  async submitVerification(): Promise<void> {
    if (!this.canSubmitVerification()) return;
    this.error.set(null);
    try {
      const r = await this.api.fetch('/api/providers/me/submit-verification', { method: 'POST' });
      const body = await r.json().catch(() => ({})) as { message?: string };
      if (!r.ok) throw new Error(body.message ?? 'Complete all required details first.');
      await this.load(); this.message.set('Profile submitted for verification.');
    } catch (error) { this.error.set((error as Error).message); }
  }
}
