import { Component, signal, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Router, NavigationStart, NavigationEnd, NavigationCancel, NavigationError } from '@angular/router';
import { SeoService } from './core/services/seo.service';
import { ThemeService } from './core/services/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <!-- Route progress bar -->
    @if (navigating()) {
      <div class="fixed top-0 left-0 right-0 z-[9999] h-0.5 bg-blue-100 overflow-hidden">
        <div class="h-full bg-blue-600 animate-route-progress"></div>
      </div>
    }

    <router-outlet />
  `,
  styles: [`
    @keyframes route-progress {
      0%   { width: 0%; opacity: 1; }
      70%  { width: 85%; opacity: 1; }
      100% { width: 100%; opacity: 0; }
    }
    .animate-route-progress { animation: route-progress 1.5s ease-out forwards; }
  `]
})
export class AppComponent {
  readonly navigating = signal(false);

  constructor() {
    inject(SeoService);
    inject(ThemeService);
    inject(Router).events.subscribe(e => {
      if (e instanceof NavigationStart)                                                              this.navigating.set(true);
      if (e instanceof NavigationEnd || e instanceof NavigationCancel || e instanceof NavigationError) this.navigating.set(false);
      if (e instanceof NavigationEnd) window.scrollTo({ top: 0, behavior: 'instant' });
    });
  }
}
