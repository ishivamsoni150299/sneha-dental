import { Component, input, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-testimonial-card',
  standalone: true,
  imports: [],
  templateUrl: './testimonial-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TestimonialCardComponent {
  name     = input.required<string>();
  location = input<string>('');
  rating   = input<number>(5);
  review   = input.required<string>();
}
