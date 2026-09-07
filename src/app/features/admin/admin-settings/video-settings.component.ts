import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { VideoConsultationService } from '../../../core/services/video-consultation.service';

@Component({
  selector: 'app-video-settings', standalone: true, imports: [FormsModule], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="video-settings-title">
      <div class="flex items-start gap-3"><span class="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-2xl text-blue-600"><i class="ph ph-video-camera" aria-hidden="true"></i></span><div><h2 id="video-settings-title" class="text-lg font-semibold text-gray-900">Video consultations</h2><p class="mt-1 text-sm leading-6 text-gray-500">Offer a private video appointment alongside visits to your clinic.</p></div></div>
      @if (loading()) {<p role="status" class="mt-4 text-sm text-gray-500">Loading video settings…</p>}
      @else {
        @if (!providerReady()) {<p class="mt-4 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">Video calling is awaiting platform setup. Contact the platform administrator to activate it.</p>}
        <form (ngSubmit)="save()" class="mt-5 space-y-4">
          <label class="flex min-h-11 items-center gap-3 text-sm font-semibold text-gray-800"><input type="checkbox" name="videoEnabled" [(ngModel)]="enabled" [disabled]="!providerReady() && !enabled" class="size-5 rounded border-gray-300 text-blue-600"> Accept video consultation requests</label>
          <div><label for="video-fee" class="block text-sm font-semibold text-gray-800">Video consultation fee (₹)</label><input id="video-fee" name="videoFee" type="number" min="0" max="100000" step="1" [(ngModel)]="fee" class="mt-2 min-h-11 w-full rounded-xl border border-gray-300 px-4 sm:max-w-xs" placeholder="Confirm with patient"><p class="mt-2 text-xs leading-5 text-gray-500">Uses your verified dentists’ existing appointment slots. Patients join from My appointments after you confirm; clinic staff join from the dashboard. Fees are settled directly with your clinic.</p></div>
          <button type="submit" [disabled]="saving() || failedToLoad()" class="min-h-11 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">{{ saving() ? 'Saving…' : 'Save video settings' }}</button>
        </form>
      }
      @if (message()) {<p role="status" class="mt-4 text-sm text-blue-700">{{ message() }}</p>}
      @if (error()) {<p role="alert" class="mt-4 text-sm text-red-700">{{ error() }}</p>}
    </section>
  `,
})
export class VideoSettingsComponent implements OnInit {
  private readonly video = inject(VideoConsultationService);
  readonly loading = signal(true);
  readonly providerReady = signal(false);
  readonly saving = signal(false);
  readonly failedToLoad = signal(false);
  readonly message = signal('');
  readonly error = signal('');
  enabled = false;
  fee: number | null = null;
  async ngOnInit(): Promise<void> {
    try {
      const settings = await this.video.settings();
      this.providerReady.set(settings.providerReady);
      this.enabled = settings.enabled;
      this.fee = settings.fee == null ? null : Number(settings.fee);
    } catch {
      this.failedToLoad.set(true);
      this.error.set('Could not load video settings. Refresh the page to try again.');
    } finally { this.loading.set(false); }
  }
  async save(): Promise<void> {
    if (this.saving() || this.failedToLoad()) return;
    if (this.fee != null && (!Number.isInteger(this.fee) || this.fee < 0 || this.fee > 100000)) {
      this.error.set('Enter a whole-number fee between ₹0 and ₹100,000.'); return;
    }
    this.saving.set(true); this.error.set(''); this.message.set('');
    try { await this.video.saveSettings(this.enabled, this.fee); this.message.set('Video consultation settings saved.'); }
    catch (error) { this.error.set(error instanceof Error ? error.message : 'Could not save video settings.'); }
    finally { this.saving.set(false); }
  }
}
