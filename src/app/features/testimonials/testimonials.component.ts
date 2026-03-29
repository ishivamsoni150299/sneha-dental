import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TestimonialCardComponent } from '../../shared/components/testimonial-card/testimonial-card.component';

@Component({
  selector: 'app-testimonials',
  standalone: true,
  imports: [RouterLink, TestimonialCardComponent],
  templateUrl: './testimonials.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TestimonialsComponent {
  testimonials = [
    { name: 'Priya M.',    location: 'Pune - Verified Patient',      rating: 5, review: 'I was terrified of dentists all my life. The doctor made my root canal completely painless. I could not believe how comfortable it was!' },
    { name: 'Rahul S.',    location: 'Mumbai - Verified Patient',    rating: 5, review: 'Got my root canal done here. Zero pain, zero drama. The staff is incredibly professional and kind throughout.' },
    { name: 'Anita K.',    location: 'Nashik - Verified Patient',    rating: 5, review: 'Best dental clinic I have ever visited. Transparent pricing - I knew the full cost before they started. No hidden charges.' },
    { name: 'Sunita P.',   location: 'Pune - Verified Patient',      rating: 5, review: 'Brought my 7-year-old daughter for her first dental visit. The doctor made her laugh through the whole checkup. We are regulars now!' },
    { name: 'Vijay R.',    location: 'Mumbai - Verified Patient',    rating: 5, review: 'Had 3 teeth whitened. Results were beyond my expectations. The clinic is spotlessly clean and the team is warm and welcoming.' },
    { name: 'Meera D.',    location: 'Thane - Verified Patient',     rating: 5, review: 'Had severe tooth pain on a Sunday and they gave me a same-day slot. Incredible service. My filling was done quickly and painlessly.' },
  ];
}
