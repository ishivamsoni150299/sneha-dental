import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ClinicConfigService } from '../../core/services/clinic-config.service';
import type {
  ClinicHomeCustomization,
  ClinicImage,
  ClinicService,
} from '../../core/config/clinic.config';
import {
  DEFAULT_CLINIC_MOMENTS,
  DEFAULT_TRUST_PILLS,
} from '../../core/content/clinic-marketing.content';
import { ServiceCardComponent } from '../../shared/components/service-card/service-card.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, ServiceCardComponent],
  templateUrl: './home.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  readonly clinic = inject(ClinicConfigService);

  readonly config = this.clinic.config;

  readonly defaultClinicMoments = DEFAULT_CLINIC_MOMENTS;
  readonly defaultTrustPills = DEFAULT_TRUST_PILLS;

  get previewServices(): ClinicService[] { return this.config.services.slice(0, 6); }
  get hasTestimonials(): boolean { return this.config.testimonials.length > 0; }

  get homeContent(): ClinicHomeCustomization {
    return this.config.customization?.content?.home ?? {};
  }

  get clinicMoments(): readonly ClinicImage[] {
    const images = this.config.customization?.media?.clinicImages?.filter(image => image.src && image.alt) ?? [];
    return images.length ? images.slice(0, 3) : this.defaultClinicMoments;
  }

  get hasPatientCount(): boolean {
    const count = Number(String(this.config.patientCount ?? '').replace(/[^\d.]/g, ''));
    return Number.isFinite(count) && count > 0;
  }

  get hasRating(): boolean {
    const rating = Number(this.config.rating);
    return Number.isFinite(rating) && rating > 0 && rating <= 5;
  }

  get clinicContext(): string {
    const doctor = [this.config.doctorName, this.config.doctorQualification]
      .map(value => value?.trim())
      .filter(Boolean)
      .join(', ');
    return [doctor, this.config.city?.trim()].filter(Boolean).join(' | ')
      || 'Gentle care, clearly explained.';
  }

  get heroImageEyebrow(): string {
    const hasCustomImage = this.config.customization?.media?.clinicImages
      ?.some(image => Boolean(image.src && image.alt)) ?? false;
    return hasCustomImage ? (this.clinicMoments[0].label?.trim() || 'Our clinic') : 'A calmer dental visit';
  }

  get heroEyebrow(): string { return this.homeContent.eyebrow ?? 'Modern dentistry, close to home'; }
  get heroTitle(): string { return this.homeContent.heroTitle ?? 'Gentle Dental Care'; }
  get heroHighlight(): string { return this.homeContent.heroHighlight ?? 'Rooted in Trust'; }
  get heroSubtitle(): string {
    return this.homeContent.heroSubtitle ?? 'Thoughtful care for every generation, with modern equipment, sterilised tools, and prices explained before treatment.';
  }

  get trustPills(): readonly string[] {
    const pills = this.homeContent.trustPills?.filter(Boolean).slice(0, 4) ?? [];
    return pills.length ? pills : this.defaultTrustPills;
  }

  get finalCtaTitle(): string { return this.homeContent.finalCtaTitle ?? 'A healthier smile starts close to home.'; }
  get finalCtaSubtitle(): string {
    return this.homeContent.finalCtaSubtitle ?? 'Same-day slots available. Confirmed within 2 hours. No hidden charges.';
  }
}
