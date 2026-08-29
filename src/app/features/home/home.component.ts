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

  get heroEyebrow(): string { return this.homeContent.eyebrow ?? 'Dental Excellence'; }
  get heroTitle(): string { return this.homeContent.heroTitle ?? 'Pain-Free Care'; }
  get heroHighlight(): string { return this.homeContent.heroHighlight ?? 'You Can Trust'; }
  get heroSubtitle(): string {
    return this.homeContent.heroSubtitle ?? 'Modern equipment, sterilized tools, and honest pricing - for every age, every visit.';
  }

  get trustPills(): readonly string[] {
    const pills = this.homeContent.trustPills?.filter(Boolean).slice(0, 4) ?? [];
    return pills.length ? pills : this.defaultTrustPills;
  }

  get finalCtaTitle(): string { return this.homeContent.finalCtaTitle ?? 'Ready for a Healthier Smile?'; }
  get finalCtaSubtitle(): string {
    return this.homeContent.finalCtaSubtitle ?? 'Same-day slots available. Confirmed within 2 hours. No hidden charges.';
  }
}
