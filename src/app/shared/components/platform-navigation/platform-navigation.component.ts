import { ChangeDetectionStrategy, Component, ViewEncapsulation, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthFacade } from '../../../core/services/auth-facade.service';

@Component({
  selector: 'app-platform-navigation',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './platform-navigation.component.html',
  styleUrl: './platform-navigation.component.css',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformNavigationComponent {
  readonly auth = inject(AuthFacade);
}
