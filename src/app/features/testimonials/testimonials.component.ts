import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TestimonialCardComponent } from '../../shared/components/testimonial-card/testimonial-card.component';
import { ClinicConfigService } from '../../core/services/clinic-config.service';


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

  get testimonials() {
    return this.config.testimonials ?? [];
  }

  get hasTestimonials() {
    return this.testimonials.length > 0;
  }
}
