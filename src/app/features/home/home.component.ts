import { ChangeDetectionStrategy, Component, inject, computed } from '@angular/core';
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

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './home.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  readonly clinic = inject(ClinicConfigService);

  readonly config = this.clinic.config;

  readonly defaultClinicMoments = DEFAULT_CLINIC_MOMENTS;
  readonly defaultTrustPills = DEFAULT_TRUST_PILLS;

  readonly previewServices = computed<ClinicService[]>(() => this.config.services.slice(0, 6));
  readonly hasTestimonials = computed(() => this.config.testimonials.length > 0);

  readonly homeContent = computed<ClinicHomeCustomization>(() => {
    return this.config.customization?.content?.home ?? {};
  });

  readonly clinicMoments = computed<readonly ClinicImage[]>(() => {
    const images = this.config.customization?.media?.clinicImages?.filter(image => image.src && image.alt) ?? [];
    return images.length ? images.slice(0, 3) : this.defaultClinicMoments;
  });

  readonly careImage = computed<ClinicImage>(() => {
    return this.clinicMoments()[1] ?? this.clinicMoments()[0];
  });

  readonly hasPatientCount = computed(() => {
    const count = Number(String(this.config.patientCount ?? '').replace(/[^\\d.]/g, ''));
    return Number.isFinite(count) && count > 0;
  });

  readonly hasRating = computed(() => {
    const rating = Number(this.config.rating);
    return Number.isFinite(rating) && rating > 0 && rating <= 5;
  });

  readonly clinicContext = computed<string>(() => {
    const doctor = [this.config.doctorName, this.config.doctorQualification]
      .map(value => value?.trim())
      .filter(Boolean)
      .join(', ');
    return [doctor, this.config.city?.trim()].filter(Boolean).join(' | ')
      || 'Gentle care, clearly explained.';
  });

  readonly heroImageEyebrow = computed<string>(() => {
    const hasCustomImage = this.config.customization?.media?.clinicImages
      ?.some(image => Boolean(image.src && image.alt)) ?? false;
    return hasCustomImage ? (this.clinicMoments()[0].label?.trim() || 'Our clinic') : 'A calmer dental visit';
  });

  readonly heroEyebrow = computed<string>(() => this.homeContent().eyebrow ?? 'Modern dentistry, close to home');
  readonly heroTitle = computed<string>(() => this.homeContent().heroTitle ?? 'Gentle Dental Care');
  readonly heroHighlight = computed<string>(() => this.homeContent().heroHighlight ?? 'Rooted in Trust');
  readonly heroSubtitle = computed<string>(() => {
    return this.homeContent().heroSubtitle ?? 'Thoughtful care for every generation, with modern equipment, sterilised tools, and prices explained before treatment.';
  });

  readonly trustPills = computed<readonly string[]>(() => {
    const pills = this.homeContent().trustPills?.filter(Boolean).slice(0, 4) ?? [];
    return pills.length ? pills : this.defaultTrustPills;
  });

  readonly finalCtaTitle = computed<string>(() => this.homeContent().finalCtaTitle ?? 'A healthier smile starts close to home.');
  readonly finalCtaSubtitle = computed<string>(() => {
    return this.homeContent().finalCtaSubtitle ?? 'Same-day slots available. Confirmed within 2 hours. No hidden charges.';
  });
}
