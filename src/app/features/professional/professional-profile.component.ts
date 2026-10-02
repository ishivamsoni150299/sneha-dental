import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, input, output, signal } from '@angular/core';
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
          <div><h2 class="text-xl font-bold text-ui-ink">Your profile</h2><p class="mt-1 text-sm text-ui-ink-muted">Add your credentials and practice here. Set hours in the next tab.</p></div>
          @if (profile()) { <span class="rounded-full px-3 py-1.5 text-sm font-bold" [class]="profile()!.verificationStatus === 'verified' ? 'bg-green-100 text-green-800' : profile()!.verificationStatus === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-gray-200 text-gray-700'">{{ profile()!.verificationStatus }}</span> }
        </div>
        @if (profile()?.verificationStatus === 'rejected' && profile()?.verificationReason) { <p class="mt-4 ui-alert ui-alert-danger" role="status">Verification rejected: {{ profile()?.verificationReason }}. Update your details and submit again.</p> }
        @if (message()) { <p class="mt-4 ui-alert" role="status">{{ message() }}</p> }
        @if (error()) { <p class="mt-4 ui-alert ui-alert-danger" role="alert">{{ error() }}</p> }
        @if (loading()) { <p class="mt-8 text-sm text-ui-ink-muted">Loading your profile…</p> }
        @else {
          <div class="mt-5 grid gap-5 lg:grid-cols-[1.35fr_0.9fr]">
            <form [formGroup]="profileForm" (ngSubmit)="saveProfile()" class="ui-card p-5 sm:p-6">
              <h3 class="text-lg font-bold text-ui-ink">1. Professional details</h3>
              <p class="mt-1 text-sm text-ui-ink-muted">Save these before submitting for verification.</p>
              <section class="mt-5 rounded-xl border border-ui-line p-4" aria-labelledby="dentist-photo-title">
                <h4 id="dentist-photo-title" class="font-semibold">Profile photo</h4>
                <p id="dentist-photo-help" class="mt-1 text-sm text-ui-ink-muted">Add a clear photo of yourself. JPG or PNG, up to 5 MB and 20 megapixels. It appears on your public dentist profile after verification.</p>
                @if (photoPreview()) { <img [src]="photoPreview()" alt="Your dentist profile photo" class="mt-3 h-28 w-28 rounded-xl object-cover" width="112" height="112"> }
                @else { <p class="mt-3 text-sm text-ui-ink-muted">No photo added yet.</p> }
                <label for="dentist-photo" class="mt-3 block text-sm font-semibold">{{ profile()?.photoUrl ? 'Replace photo' : 'Add photo' }}</label>
                <input id="dentist-photo" type="file" accept="image/jpeg,image/png" aria-describedby="dentist-photo-help" [disabled]="saving()" (change)="uploadPhoto($event)" class="mt-2 block w-full min-w-0 text-sm">
                @if (profile()?.photoUrl) { <button type="button" (click)="removePhoto()" [disabled]="saving()" class="ui-btn ui-btn-ghost mt-3">Remove photo</button> }
                <p class="mt-2 text-xs text-ui-ink-muted">Photo changes save immediately. Save other details below.</p>
              </section>
              <div class="mt-5 grid gap-4 sm:grid-cols-2">
                <label class="text-sm font-semibold">Full name<input formControlName="fullName" required class="ui-field mt-1.5 text-base"></label>
                <label class="text-sm font-semibold">Qualification<input formControlName="qualification" required class="ui-field mt-1.5 text-base" placeholder="BDS"></label>
                <label class="text-sm font-semibold">Speciality<input formControlName="speciality" required class="ui-field mt-1.5 text-base" placeholder="General dentistry"></label>
                <label class="text-sm font-semibold">Registration number<input formControlName="registrationNumber" required class="ui-field mt-1.5 text-base"></label>
                <label class="text-sm font-semibold sm:col-span-2">Registration council<input formControlName="registrationCouncil" required class="ui-field mt-1.5 text-base" placeholder="Your state dental council"></label>
              </div>
              <details class="mt-5 rounded-xl border border-ui-line p-4">
                <summary class="cursor-pointer text-sm font-semibold text-blue-700">Optional profile details</summary>
                <div class="mt-4 grid gap-4 sm:grid-cols-2">
                  <label class="text-sm font-semibold">Experience in years<input formControlName="experienceYears" type="number" min="0" max="80" class="ui-field mt-1.5 text-base"></label>
                  <label class="text-sm font-semibold">Phone in international format<input formControlName="phoneE164" class="ui-field mt-1.5 text-base" placeholder="+919876543210"></label>
                  <label class="text-sm font-semibold sm:col-span-2">Languages<input formControlName="languages" class="ui-field mt-1.5 text-base" placeholder="Hindi, English"></label>
                  <label class="text-sm font-semibold sm:col-span-2">Biography<textarea formControlName="biography" rows="3" class="ui-field mt-1.5 text-base"></textarea></label>
                </div>
              </details>
              <button class="ui-btn ui-btn-primary mt-5" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save professional details' }}</button>
            </form>
            <div class="space-y-5">
              <section class="ui-card p-5 sm:p-6">
                <h3 class="text-lg font-bold text-ui-ink">2. Practice location</h3>
                @if (profile()?.locations?.length) { <ul class="mt-4 space-y-2">@for (location of profile()!.locations; track location.id) { <li class="rounded-xl border border-ui-line p-3"><p class="font-bold text-ui-ink">{{ location.name }}</p><p class="text-sm text-ui-ink-muted">{{ location.city }} · {{ location.status }}</p></li> }</ul> }
                @else { <p class="mt-2 text-sm text-ui-ink-muted">Add where patients can book you.</p> }
                <form [formGroup]="locationForm" (ngSubmit)="addLocation()" class="mt-4 space-y-3 border-t border-ui-line pt-4">
                  <label class="block text-sm font-semibold">Practice or clinic name<input formControlName="name" required class="ui-field mt-1 text-base"></label>
                  <label class="block text-sm font-semibold">Street address<input formControlName="addressLine1" required class="ui-field mt-1 text-base"></label>
                  <div class="grid grid-cols-2 gap-3"><label class="text-sm font-semibold">Locality<input formControlName="locality" class="ui-field mt-1 text-base"></label><label class="text-sm font-semibold">City<input formControlName="city" required class="ui-field mt-1 text-base"></label></div>
                  <label class="block text-sm font-semibold">Consultation fee (₹)<input formControlName="consultationFee" type="number" min="0" required class="ui-field mt-1 text-base"></label>
                  <button class="ui-btn ui-btn-secondary w-full" [disabled]="savingLocation()">{{ savingLocation() ? 'Saving practice…' : 'Add practice and set hours' }}</button>
                </form>
              </section>
              <section class="ui-card p-5 sm:p-6">
                <h3 class="text-lg font-bold">3. Verification</h3>
                <p class="mt-2 text-sm leading-6 text-ui-ink-muted">After saving your details, adding a practice and setting hours, submit for review. Your profile appears to patients once approved.</p>
                @if (!hasHours() && profile()?.verificationStatus !== 'verified') { <p class="mt-2 text-sm font-semibold text-amber-800">Set at least one bookable day in Hours to enable submission.</p> }
                <button (click)="submitVerification()" class="ui-btn ui-btn-primary mt-4 w-full" [disabled]="!canSubmitVerification()">Submit for verification</button>
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
  private readonly destroyRef = inject(DestroyRef);
  private destroyed = false;
  readonly embedded = input(false);
  readonly hasHours = input(false);
  readonly locationAdded = output<void>();
  readonly profileChanged = output<void>();
  readonly profile = signal<ProviderProfile | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly savingLocation = signal(false);
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly photoPreview = signal('');
  private photoObjectUrl = '';
  readonly profileForm = this.fb.nonNullable.group({ fullName: ['', Validators.required], qualification: ['', Validators.required], speciality: ['', Validators.required], biography: [''], experienceYears: [0, [Validators.min(0), Validators.max(80)]], registrationNumber: ['', Validators.required], registrationCouncil: ['', Validators.required], phoneE164: [''], languages: [''] });
  readonly locationForm = this.fb.nonNullable.group({ name: ['', Validators.required], addressLine1: ['', Validators.required], locality: [''], city: ['', Validators.required], consultationFee: [0, [Validators.required, Validators.min(0)]] });

  constructor() {
    this.destroyRef.onDestroy(() => { this.destroyed = true; if (this.photoObjectUrl) URL.revokeObjectURL(this.photoObjectUrl); });
  }

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
      await this.loadPhoto(p.photoUrl);
    } catch (error) { this.error.set((error as Error).message); }
    finally { this.loading.set(false); }
  }
  private async loadPhoto(url: string | null): Promise<void> {
    let preview = url ?? '';
    if (url?.startsWith('/api/public/provider-photos/')) {
      const response = await this.api.fetch('/api/providers/me/photo');
      if (!response.ok) throw new Error('Your photo could not be loaded. Refresh to try again.');
      const blob = await response.blob();
      if (this.destroyed) return;
      preview = URL.createObjectURL(blob);
    }
    if (this.destroyed) return;
    if (this.photoObjectUrl) URL.revokeObjectURL(this.photoObjectUrl);
    this.photoObjectUrl = preview.startsWith('blob:') ? preview : '';
    this.photoPreview.set(preview);
  }
  async uploadPhoto(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0]; input.value = '';
    if (!file || this.saving()) return;
    this.error.set(null); this.message.set(null);
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      this.error.set('Choose a JPG or PNG photo smaller than 5 MB.'); return;
    }
    this.saving.set(true);
    try {
      const response = await this.api.fetch('/api/providers/me/photo', { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail || result.message || 'Photo could not be saved. Please try again.');
      if (this.destroyed) return;
      this.profile.update(p => p ? { ...p, photoUrl: result.photoUrl } : p);
      await this.loadPhoto(result.photoUrl);
      this.message.set('Profile photo saved.');
    } catch (e) { this.error.set((e as Error).message); }
    finally { this.saving.set(false); }
  }
  async removePhoto(): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true); this.error.set(null); this.message.set(null);
    try {
      const response = await this.api.fetch('/api/providers/me/photo', { method: 'DELETE' });
      if (!response.ok) throw new Error('Photo could not be removed. Please try again.');
      if (this.destroyed) return;
      this.profile.update(p => p ? { ...p, photoUrl: null } : p);
      await this.loadPhoto(null); this.message.set('Profile photo removed.');
    } catch (e) { this.error.set((e as Error).message); }
    finally { this.saving.set(false); }
  }
  async saveProfile(): Promise<void> {
    if (this.saving()) return;
    this.message.set(null);
    this.profileForm.markAllAsTouched();
    if (this.profileForm.invalid) {
      this.error.set('Complete all required professional details. Experience must be between 0 and 80 years.');
      return;
    }
    this.saving.set(true); this.error.set(null);
    try {
      const v = this.profileForm.getRawValue();
      const r = await this.api.fetch('/api/providers/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...v, languages: v.languages.split(',').map(x => x.trim()).filter(Boolean), photoUrl: this.profile()?.photoUrl ?? '' }) });
      if (!r.ok) throw new Error('Could not save profile.');
      await this.load(); this.profileChanged.emit(); this.message.set('Professional details saved.');
    } catch (error) { this.error.set((error as Error).message); }
    finally { this.saving.set(false); }
  }
  async addLocation(): Promise<void> {
    if (this.savingLocation()) return;
    this.message.set(null);
    this.locationForm.markAllAsTouched();
    if (this.locationForm.invalid) {
      this.error.set('Enter a practice name, street address and city, with a consultation fee of zero or more.');
      return;
    }
    this.savingLocation.set(true);
    this.error.set(null);
    try {
      const v = this.locationForm.getRawValue();
      const r = await this.api.fetch('/api/providers/me/locations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...v, addressLine2: '', state: '', postalCode: '', phoneE164: '', acceptingNewPatients: true, schedule: {} }) });
      if (!r.ok) throw new Error('Could not add location.');
      if (this.destroyed) return;
      this.locationForm.reset({ name: '', addressLine1: '', locality: '', city: '', consultationFee: 0 });
      await this.load();
      if (!this.destroyed) this.locationAdded.emit();
    } catch (error) { this.error.set((error as Error).message); }
    finally { this.savingLocation.set(false); }
  }
  async submitVerification(): Promise<void> {
    if (!this.canSubmitVerification()) return;
    this.error.set(null);
    try {
      const r = await this.api.fetch('/api/providers/me/submit-verification', { method: 'POST' });
      const body = await r.json().catch(() => ({})) as { message?: string };
      if (!r.ok) throw new Error(body.message ?? 'Complete all required details first.');
      await this.load(); this.profileChanged.emit(); this.message.set('Profile submitted for verification.');
    } catch (error) { this.error.set((error as Error).message); }
  }
}
