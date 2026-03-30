import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TestimonialCardComponent } from '../../shared/components/testimonial-card/testimonial-card.component';
import { ClinicConfigService } from '../../core/services/clinic-config.service';

const FALLBACK_TESTIMONIALS = [
  { name: 'Priya M.',    location: 'Verified Patient',      rating: 5, review: 'I was terrified of dentists all my life. The doctor made my root canal completely painless. I could not believe how comfortable it was!' },
  { name: 'Rahul S.',    location: 'Verified Patient',    rating: 5, review: 'Got my root canal done here. Zero pain, zero drama. The staff is incredibly professional and kind throughout.' },
  { name: 'Anita K.',    location: 'Verified Patient',    rating: 5, review: 'Best dental clinic I have ever visited. Transparent pricing - I knew the full cost before they started. No hidden charges.' },
  { name: 'Sunita P.',   location: 'Verified Patient',      rating: 5, review: 'Brought my 7-year-old daughter for her first dental visit. The doctor made her laugh through the whole checkup. We are regulars now!' },
  { name: 'Vijay R.',    location: 'Verified Patient',    rating: 5, review: 'Had 3 teeth whitened. Results were beyond my expectations. The clinic is spotlessly clean and the team is warm and welcoming.' },
  { name: 'Meera D.',    location: 'Verified Patient',     rating: 5, review: 'Had severe tooth pain on a Sunday and they gave me a same-day slot. Incredible service. My filling was done quickly and painlessly.' },
];

@Component({
  selector: 'app-testimonials',
  standalone: true,
  imports: [RouterLink, TestimonialCardComponent],
  templateUrl: './testimonials.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TestimonialsComponent {
  readonly config = inject(ClinicConfigService).config;

  get testimonials() {
    return this.config.testimonials?.length ? this.config.testimonials : FALLBACK_TESTIMONIALS;
  }
}
