import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
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

  readonly testimonials = computed<Testimonial[]>(() => this.config.testimonials);

  readonly hasTestimonials = computed(() => this.testimonials().length > 0);
}
