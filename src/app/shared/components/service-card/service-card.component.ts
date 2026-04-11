import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
@Component({
  selector: 'app-service-card',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './service-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServiceCardComponent {
  iconPath    = input.required<string>();
  name        = input.required<string>();
  description = input<string>('');
  benefit     = input<string>('');
  price       = input<string>('');
}
