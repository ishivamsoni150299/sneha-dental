import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { Doctor } from '../../core/services/doctor.service';
import { DoctorService } from '../../core/services/doctor.service';
import {
  MarketplaceService,
  type MarketplaceClinic,
  type MarketplaceReview,
} from '../../core/services/marketplace.service';
import { PatientAppointmentApiService } from '../../core/services/patient-appointment-api.service';
import { PatientAuthService } from '../../core/services/patient-auth.service';
import { AnalyticsService } from '../../core/services/analytics.service';
import { SeoService } from '../../core/services/seo.service';

@Component({
  selector: 'app-dentist-profile',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './dentist-profile.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DentistProfileComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly marketplace = inject(MarketplaceService);
  private readonly doctorService = inject(DoctorService);
  private readonly patientApi = inject(PatientAppointmentApiService);
  private readonly analytics = inject(AnalyticsService);
  private readonly seo = inject(SeoService);
  private readonly destroyRef = inject(DestroyRef);
  private loadId = 0;
  readonly patientAuth = inject(PatientAuthService);

  readonly clinic = signal<MarketplaceClinic | null>(null);
  readonly verifiedDoctors = signal<Doctor[]>([]);
  readonly reviews = signal<MarketplaceReview[]>([]);
  readonly averageRating = computed(() => {
    const reviews = this.reviews();
    if (!reviews.length) return null;
    return reviews.reduce((total, review) => total + review.rating, 0) / reviews.length;
  });
  readonly loading = signal(true);
  readonly notFound = signal(false);
  readonly error = signal<string | null>(null);
  readonly reportId = signal<string | null>(null);
  readonly reporting = signal(false);
  readonly reportMessage = signal<string | null>(null);
  readonly reportedReviewIds = signal(new Set<string>());
  readonly reportForm = this.fb.nonNullable.group({
    reason: ['misleading', Validators.required],
    details: ['', Validators.maxLength(500)],
  });

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => { this.loadId++; });
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      void this.loadProfile(params.get('slug') ?? '');
    });
  }

  private async loadProfile(slug: string): Promise<void> {
    const loadId = ++this.loadId;
    this.loading.set(true); this.clinic.set(null); this.error.set(null); this.notFound.set(false);
    this.reviews.set([]); this.verifiedDoctors.set([]); this.reportId.set(null); this.reportMessage.set(null);
    this.seo.publicProfileUnavailable();
    try {
      const namespace = this.route.snapshot.parent?.routeConfig?.path;
      const clinic = namespace === 'dentist'
        ? await this.marketplace.getVerifiedProviderBySlug(slug)
        : await this.marketplace.getVerifiedClinicBySlug(slug, namespace !== 'clinic');
      if (loadId !== this.loadId) return;
      if (!clinic) {
        this.notFound.set(true);
        this.seo.publicProfileUnavailable();
        return;
      }

      this.clinic.set(clinic);
      this.seo.setPublicProfile(clinic);
      this.analytics.trackDentistProfileView({
        dentist_id: clinic.id,
        dentist_name: clinic.doctorName,
        locality: clinic.marketplaceProfile?.locality,
        city: clinic.city,
        is_independent: clinic.isIndependent ?? false,
      });
      if (clinic.profileEntity !== 'dentist') try {
        const reviews = await this.marketplace.getPublishedReviews(clinic.id);
        if (loadId !== this.loadId) return;
        this.reviews.set(reviews);
      } catch (error) {
        console.error('[Marketplace] Published reviews could not be loaded:', error);
      }
      if (clinic.profileEntity !== 'dentist') {
        try {
          const publicDentists = await this.marketplace.getPublicClinicDentists(clinic.marketplaceSlug ?? slug);
          if (loadId !== this.loadId) return;
          clinic.publicDentists = publicDentists; this.clinic.set({ ...clinic });
        }
        catch { /* Verified legacy team remains visible when public identity links are unavailable. */ }
      }
      const verifiedIds = new Set(clinic.marketplaceVerifiedDoctorIds ?? []);
      if (clinic.profileEntity !== 'dentist' && verifiedIds.size > 0) {
        try {
          const doctors = await this.doctorService.getDoctors(clinic.id);
          if (loadId !== this.loadId) return;
          this.verifiedDoctors.set(doctors.filter(doctor => doctor.id && verifiedIds.has(doctor.id)));
        } catch (error) {
          console.error('[Marketplace] Verified doctors could not be loaded:', error);
        }
      }
    } catch (error) {
      if (loadId !== this.loadId) return;
      console.error('[Marketplace] Profile load failed:', error);
      this.error.set('This profile could not be loaded. Please try again shortly.');
      this.seo.publicProfileUnavailable();
    } finally {
      if (loadId === this.loadId) this.loading.set(false);
    }
  }

  serviceLabels(clinic: MarketplaceClinic): string[] {
    return clinic.marketplaceProfile!.serviceIds.map(serviceId =>
      this.marketplace.serviceLabel(serviceId),
    );
  }

  listingImage(clinic: MarketplaceClinic): string {
    return this.marketplace.listingImage(clinic);
  }

  hasListingPhoto(clinic: MarketplaceClinic): boolean {
    return this.marketplace.hasListingPhoto(clinic);
  }

  clinicWebsiteUrl(clinic: MarketplaceClinic): string | null {
    return this.marketplace.clinicWebsiteUrl(clinic);
  }

  phoneUrl(clinic: MarketplaceClinic): string | null {
    const digits = String(clinic.phoneE164 || clinic.phone || '').replace(/\D/g, '');
    return digits ? `tel:+${digits}` : null;
  }

  whatsappUrl(clinic: MarketplaceClinic): string | null {
    const digits = String(clinic.whatsappNumber || '').replace(/\D/g, '');
    if (!digits) return null;
    const message = `Hi ${clinic.name}, I found your verified profile on mydentalplatform and would like an appointment.`;
    return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  }

  address(clinic: MarketplaceClinic): string {
    return [
      clinic.addressLine1,
      clinic.addressLine2,
      clinic.marketplaceProfile?.locality,
      clinic.city,
    ].filter(Boolean).join(', ');
  }

  formattedFee(clinic: MarketplaceClinic): string {
    const fee = clinic.marketplaceProfile?.consultationFee;
    return fee == null ? 'Ask clinic' : `₹${fee.toLocaleString('en-IN')}`;
  }

  doctorInitials(name: string): string {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  }

  openReport(reviewId: string): void {
    this.reportMessage.set(null);
    if (!this.patientAuth.isSignedIn() || this.patientAuth.role() !== 'patient') {
      this.reportMessage.set('Verify your mobile in My appointments before reporting a review.');
      return;
    }
    this.reportForm.reset({ reason: 'misleading', details: '' });
    this.reportId.set(reviewId);
  }

  async submitReport(reviewId: string): Promise<void> {
    this.reportForm.markAllAsTouched();
    if (this.reportForm.invalid || this.reporting()) return;
    this.reporting.set(true);
    this.reportMessage.set(null);
    try {
      const { reason, details } = this.reportForm.getRawValue();
      await this.patientApi.reportReview(reviewId, reason, details);
      this.reportedReviewIds.update(ids => new Set(ids).add(reviewId));
      this.reportId.set(null);
      this.reportMessage.set('Thanks. The platform team will review this report.');
    } catch (error) {
      this.reportMessage.set(error instanceof Error ? error.message : 'The report could not be sent.');
    } finally {
      this.reporting.set(false);
    }
  }

  formatReviewDate(value: string | null): string {
    if (!value) return 'Recently published';
    return new Date(value).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  }
}
