import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TestimonialCardComponent } from '../../shared/components/testimonial-card/testimonial-card.component';
import { ClinicConfigService } from '../../core/services/clinic-config.service';
import type { Testimonial } from '../../core/config/clinic.config';


@Component({
  selector: 'app-testimonials',
  standalone: true,
  imports: [RouterLink, TestimonialCardComponent],
  templateUrl: './testimonials.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TestimonialsComponent {
  readonly clinic = inject(ClinicConfigService);
  readonly config = this.clinic.config;

  get testimonials(): Testimonial[] {
    return this.config.testimonials;
  }

  get hasTestimonials(): boolean {
    return this.testimonials.length > 0;
  }
}
