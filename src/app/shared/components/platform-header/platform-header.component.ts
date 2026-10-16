import { ChangeDetectionStrategy, Component, ViewEncapsulation, inject, signal } from '@angular/core';
import { AuthFacade } from '../../../core/services/auth-facade.service';
import { NavigationStart, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PlatformBrandComponent } from '../platform-brand/platform-brand.component';
import { ModalDirective } from '../../directives/modal.directive';

@Component({
  selector: 'app-platform-header',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, PlatformBrandComponent, ModalDirective],
  templateUrl: './platform-header.component.html',
  styleUrl: './platform-header.component.css',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformHeaderComponent {
  readonly auth = inject(AuthFacade);
  readonly menuOpen = signal(false);

  constructor() {
    inject(Router).events.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event instanceof NavigationStart) this.closeMenu();
    });
  }

  openMenu(): void { this.menuOpen.set(true); }
  closeMenu(): void { this.menuOpen.set(false); }
}
