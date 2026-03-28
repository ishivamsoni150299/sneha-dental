import { Component, input, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-section-header',
  standalone: true,
  imports: [],
  templateUrl: './section-header.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SectionHeaderComponent {
  label    = input<string>('');
  title    = input.required<string>();
  subtitle = input<string>('');
  centered = input<boolean>(true);
}
