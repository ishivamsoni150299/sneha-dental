import { ChangeDetectionStrategy, Component, ViewEncapsulation, inject, signal } from '@angular/core';
import { AuthFacade } from '../../core/services/auth-facade.service';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { PlatformBrandComponent } from '../../shared/components/platform-brand/platform-brand.component';
import { ModalDirective } from '../../shared/directives/modal.directive';

@Component({
  selector: 'app-marketplace-layout',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, PlatformBrandComponent, ModalDirective],
  templateUrl: './marketplace-layout.component.html',
  styleUrl: './marketplace-layout.component.css',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarketplaceLayoutComponent {
  readonly auth = inject(AuthFacade);
  readonly menuOpen = signal(false);

  openMenu(): void { this.menuOpen.set(true); }
  closeMenu(): void { this.menuOpen.set(false); }
}
