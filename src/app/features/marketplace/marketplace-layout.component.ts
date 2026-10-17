import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { PlatformNavigationComponent } from '../../shared/components/platform-navigation/platform-navigation.component';
import { PlatformBrandComponent } from '../../shared/components/platform-brand/platform-brand.component';
import { PlatformHeaderComponent } from '../../shared/components/platform-header/platform-header.component';

@Component({
  selector: 'app-marketplace-layout',
  standalone: true,
  imports: [RouterLink, RouterOutlet, PlatformBrandComponent, PlatformHeaderComponent, PlatformNavigationComponent],
  templateUrl: './marketplace-layout.component.html',
  styleUrl: './marketplace-layout.component.css',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarketplaceLayoutComponent {}
