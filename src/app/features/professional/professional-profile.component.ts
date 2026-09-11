import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthenticatedApiService } from '../../core/services/authenticated-api.service';
import { AuthFacade } from '../../core/services/auth-facade.service';
import { PlatformBrandComponent } from '../../shared/components/platform-brand/platform-brand.component';

interface ProviderProfile {
  slug: string;
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
  selector: 'app-professional-profile', standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PlatformBrandComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="border-b border-gray-200 bg-white"><div class="mx-auto flex h-16 max-w-6xl items-center justify-between px-4"><a routerLink="/dentists"><app-platform-brand /></a><button (click)="logout()" class="text-sm font-semibold text-gray-600">Sign out</button></div></header>
    <main class="min-h-screen bg-gray-50 px-4 py-10">
      <div class="mx-auto max-w-6xl">
        <div class="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><p class="text-sm font-bold uppercase tracking-wider text-blue-700">Dentist portal</p><h1 class="mt-2 text-3xl font-bold text-gray-950">Your professional profile</h1><p class="mt-2 text-sm text-gray-600">This profile belongs to you and can connect to multiple clinics.</p></div>
          @if (profile()) { <span class="w-fit rounded-full px-3 py-1.5 text-sm font-bold" [class]="profile()!.verificationStatus === 'verified' ? 'bg-green-100 text-green-800' : profile()!.verificationStatus === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-gray-200 text-gray-700'">{{ profile()!.verificationStatus }}</span> }
        </div>
        <a routerLink="/professional/workspace" class="mt-5 inline-flex min-h-12 items-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700">Appointments & availability →</a>
        @if (profile()?.verificationStatus === 'rejected' && profile()?.verificationReason) {
          <p class="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-800" role="status">Verification rejected: {{ profile()?.verificationReason }}. Update your details and submit again.</p>
        }
        @if (message()) { <p class="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-900" role="status">{{ message() }}</p> }
        @if (error()) { <p class="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800" role="alert">{{ error() }}</p> }
        @if (loading()) { <p class="mt-10 text-sm text-gray-600">Loading your profile…</p> }
        @else {
          <div class="mt-8 grid gap-6 lg:grid-cols-[1.35fr_0.9fr]">
            <form [formGroup]="profileForm" (ngSubmit)="saveProfile()" class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 class="text-xl font-bold text-gray-950">Professional details</h2>
              <div class="mt-6 grid gap-4 sm:grid-cols-2">
                <label class="text-sm font-semibold">Name<input formControlName="fullName" class="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-2.5"></label>
                <label class="text-sm font-semibold">Qualification<input formControlName="qualification" class="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-2.5" placeholder="BDS, MDS"></label>
                <label class="text-sm font-semibold">Speciality<input formControlName="speciality" class="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-2.5" placeholder="Endodontist"></label>
                <label class="text-sm font-semibold">Experience in years<input formControlName="experienceYears" type="number" min="0" max="80" class="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-2.5"></label>
                <label class="text-sm font-semibold">Registration number<input formControlName="registrationNumber" class="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-2.5"></label>
                <label class="text-sm font-semibold">Registration council<input formControlName="registrationCouncil" class="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-2.5" placeholder="Delhi Dental Council"></label>
                <label class="text-sm font-semibold">Phone in international format<input formControlName="phoneE164" class="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-2.5" placeholder="+919876543210"></label>
                <label class="text-sm font-semibold">Languages<input formControlName="languages" class="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-2.5" placeholder="Hindi, English"></label>
                <label class="text-sm font-semibold sm:col-span-2">Biography<textarea formControlName="biography" rows="4" class="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-2.5"></textarea></label>
              </div>
              <button class="mt-6 rounded-xl bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-700 disabled:opacity-60" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save profile' }}</button>
            </form>
            <div class="space-y-6">
              <section class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 class="text-xl font-bold text-gray-950">Practice locations</h2>
                @if (profile()?.locations?.length) { <ul class="mt-4 space-y-3">@for (location of profile()!.locations; track location.id) { <li class="rounded-xl border border-gray-200 p-3"><p class="font-bold text-gray-900">{{ location.name }}</p><p class="text-sm text-gray-600">{{ location.city }} · {{ location.status }}</p></li> }</ul> }
                @else { <p class="mt-3 text-sm text-gray-600">Add where patients can book you.</p> }
                <form [formGroup]="locationForm" (ngSubmit)="addLocation()" class="mt-5 space-y-3 border-t border-gray-200 pt-5">
                  <input formControlName="name" class="w-full rounded-xl border border-gray-300 px-3 py-2.5" placeholder="Practice or clinic name">
                  <input formControlName="addressLine1" class="w-full rounded-xl border border-gray-300 px-3 py-2.5" placeholder="Street address">
                  <div class="grid grid-cols-2 gap-3"><input formControlName="locality" class="w-full rounded-xl border border-gray-300 px-3 py-2.5" placeholder="Locality"><input formControlName="city" class="w-full rounded-xl border border-gray-300 px-3 py-2.5" placeholder="City"></div>
                  <input formControlName="consultationFee" type="number" min="0" class="w-full rounded-xl border border-gray-300 px-3 py-2.5" placeholder="Consultation fee">
                  <button class="w-full rounded-xl border border-blue-600 px-4 py-2.5 font-bold text-blue-700">Add independent location</button>
                </form>
              </section>
              <section class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"><h2 class="text-xl font-bold">Directory verification</h2><p class="mt-2 text-sm leading-6 text-gray-600">Complete your qualification, speciality, registration and one practice location. Our team reviews the evidence before publishing.</p><button (click)="submitVerification()" class="mt-4 w-full rounded-xl bg-gray-950 px-4 py-3 font-bold text-white" [disabled]="profile()?.verificationStatus === 'pending' || profile()?.verificationStatus === 'verified'">Submit for verification</button></section>
            </div>
          </div>
        }
      </div>
    </main>
  `,
})
export class ProfessionalProfileComponent implements OnInit {
  private readonly fb = inject(FormBuilder); private readonly api = inject(AuthenticatedApiService); private readonly auth = inject(AuthFacade);
  readonly profile = signal<ProviderProfile | null>(null); readonly loading = signal(true); readonly saving = signal(false); readonly message = signal<string | null>(null); readonly error = signal<string | null>(null);
  readonly profileForm = this.fb.nonNullable.group({ fullName: ['', Validators.required], qualification: [''], speciality: [''], biography: [''], experienceYears: [0], registrationNumber: [''], registrationCouncil: [''], phoneE164: [''], languages: [''] });
  readonly locationForm = this.fb.nonNullable.group({ name: ['', Validators.required], addressLine1: ['', Validators.required], locality: [''], city: ['', Validators.required], consultationFee: [0, [Validators.required, Validators.min(0)]] });
  async ngOnInit(): Promise<void> { await this.load(); }
  async load(): Promise<void> {
    this.loading.set(true); this.error.set(null);
    try { const r = await this.api.fetch('/api/providers/me'); if (!r.ok) throw new Error('Could not load profile.'); const p = await r.json() as ProviderProfile; this.profile.set(p); this.profileForm.patchValue({ fullName: p.fullName, qualification: p.qualification ?? '', speciality: p.speciality ?? '', biography: p.biography ?? '', experienceYears: p.experienceYears ?? 0, registrationNumber: p.registrationNumber ?? '', registrationCouncil: p.registrationCouncil ?? '', phoneE164: p.phoneE164 ?? '', languages: (p.languages ?? []).join(', ') }); }
    catch (error) { this.error.set((error as Error).message); } finally { this.loading.set(false); }
  }
  async saveProfile(): Promise<void> {
    this.profileForm.markAllAsTouched(); if (this.profileForm.invalid || this.saving()) return; this.saving.set(true); this.error.set(null);
    try { const v = this.profileForm.getRawValue(); const r = await this.api.fetch('/api/providers/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...v, languages: v.languages.split(',').map(x => x.trim()).filter(Boolean), photoUrl: this.profile()?.photoUrl ?? '' }) }); if (!r.ok) throw new Error('Could not save profile.'); this.message.set('Professional profile saved.'); await this.load(); }
    catch (error) { this.error.set((error as Error).message); } finally { this.saving.set(false); }
  }
  async addLocation(): Promise<void> {
    this.locationForm.markAllAsTouched(); if (this.locationForm.invalid) return; this.error.set(null);
    try { const v = this.locationForm.getRawValue(); const r = await this.api.fetch('/api/providers/me/locations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...v, addressLine2: '', state: '', postalCode: '', phoneE164: '', acceptingNewPatients: true, schedule: {} }) }); if (!r.ok) throw new Error('Could not add location.'); this.locationForm.reset({ name: '', addressLine1: '', locality: '', city: '', consultationFee: 0 }); this.message.set('Practice location added.'); await this.load(); }
    catch (error) { this.error.set((error as Error).message); }
  }
  async submitVerification(): Promise<void> { this.error.set(null); try { const r = await this.api.fetch('/api/providers/me/submit-verification', { method: 'POST' }); const body = await r.json().catch(() => ({})) as { message?: string }; if (!r.ok) throw new Error(body.message ?? 'Complete all required details first.'); this.message.set('Profile submitted for verification.'); await this.load(); } catch (error) { this.error.set((error as Error).message); } }
  async logout(): Promise<void> { await this.auth.logout(); location.assign('/professional'); }
}
