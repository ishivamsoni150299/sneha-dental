import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-platform-brand',
  standalone: true,
  templateUrl: './platform-brand.component.html',
  styleUrl: './platform-brand.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformBrandComponent {
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly tone = input<'default' | 'inverse'>('default');
  readonly showName = input(true);
}
