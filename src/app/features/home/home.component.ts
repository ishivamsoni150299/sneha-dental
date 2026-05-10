import { NgClass, isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ClinicConfigService } from '../../core/services/clinic-config.service';
import type {
  ClinicFaq,
  ClinicHomeCustomization,
  ClinicHours,
  ClinicImage,
  ClinicService,
} from '../../core/config/clinic.config';
import {
  DEFAULT_CLINIC_MOMENTS,
  DEFAULT_TRUST_PILLS,
  HOME_FAQS,
} from '../../core/content/clinic-marketing.content';
import {
  buildClinicMonogram,
  buildDoctorLabel,
} from '../../core/utils/clinic-branding';
import { RevealDirective } from '../../shared/directives/reveal.directive';
import { ServiceCardComponent } from '../../shared/components/service-card/service-card.component';
import { TestimonialCardComponent } from '../../shared/components/testimonial-card/testimonial-card.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, NgClass, ServiceCardComponent, TestimonialCardComponent, RevealDirective],
  templateUrl: './home.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  readonly clinic = inject(ClinicConfigService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  readonly config = this.clinic.config;
  readonly clinicMonogram = buildClinicMonogram(this.config.name, 'CL');
  readonly displayDoctorName = buildDoctorLabel(this.config.doctorName, this.config.name);

  readonly defaultClinicMoments = DEFAULT_CLINIC_MOMENTS;
  readonly defaultTrustPills = DEFAULT_TRUST_PILLS;
  readonly defaultFaqs = HOME_FAQS;

  readonly openFaq = signal<number | null>(null);
  readonly showEmergencyBanner = signal(
    this.isBrowser && !sessionStorage.getItem('emergency_banner_seen'),
  );

  toggleFaq(i: number): void {
    this.openFaq.update(v => v === i ? null : i);
  }

  dismissEmergencyBanner(): void {
    if (!this.isBrowser) return;
    this.showEmergencyBanner.set(false);
    sessionStorage.setItem('emergency_banner_seen', '1');
  }

  get previewServices(): ClinicService[] { return this.config.services.slice(0, 6); }
  get hasTestimonials(): boolean { return this.config.testimonials.length > 0; }
  get heroHours(): ClinicHours[] {
    return this.config.hours.length
      ? this.config.hours.slice(0, 3)
      : [{ days: 'Mon - Sat', time: '9:00 AM - 7:00 PM' }];
  }

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

  get faqs(): readonly ClinicFaq[] {
    const faqs = this.homeContent.faqs?.filter(faq => faq.q && faq.a).slice(0, 8) ?? [];
    return faqs.length ? faqs : this.defaultFaqs;
  }
}
