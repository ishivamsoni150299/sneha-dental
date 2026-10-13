import { Component, signal, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Router, NavigationStart, NavigationEnd, NavigationCancel, NavigationError } from '@angular/router';
import { SeoService } from './core/services/seo.service';
import { ClinicConfigService } from './core/services/clinic-config.service';
import { AnalyticsService } from './core/services/analytics.service';
import { PlatformAgentComponent } from './shared/components/platform-agent/platform-agent.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, PlatformAgentComponent],
  template: `
    <!-- Route progress bar -->
    @if (navigating()) {
      <div class="fixed top-0 left-0 right-0 z-[9999] h-0.5 bg-blue-100 overflow-hidden">
        <div class="h-full bg-blue-600 animate-route-progress"></div>
      </div>
    }

    @if (failedNavigation()) {
      <div role="alert" class="fixed inset-x-4 top-4 z-[10000] mx-auto max-w-lg rounded-2xl border border-ui-line bg-ui-surface p-4 shadow-lg">
        <p class="text-sm text-ui-ink">That page couldn’t open. Your current page is still here.</p>
        <div class="mt-3 flex gap-2">
          <button type="button" class="ui-btn ui-btn-primary" (click)="retryNavigation()">Try again</button>
          <button type="button" class="ui-btn ui-btn-secondary" (click)="failedNavigation.set(null)">Dismiss</button>
        </div>
      </div>
    }

    <router-outlet />
    <app-platform-agent [mainPage]="miliPage()" />
  `,
  styles: [`
    @keyframes route-progress {
      0%   { width: 0%; opacity: 1; }
      70%  { width: 85%; opacity: 1; }
      100% { width: 100%; opacity: 0; }
    }
    .animate-route-progress { animation: route-progress 1.5s ease-out forwards; }
    @media (prefers-reduced-motion: reduce) { .animate-route-progress { animation: none; width: 70%; } }
  `]
})
export class AppComponent {
  readonly navigating = signal(false);
  readonly miliPage = signal(false);
  readonly failedNavigation = signal<string | null>(null);
  private readonly router = inject(Router);

  retryNavigation(): void {
    const url = this.failedNavigation();
    if (url) void this.router.navigateByUrl(url).catch(() => { /* NavigationError keeps the retry available. */ });
  }

  constructor() {
    inject(SeoService);
    inject(AnalyticsService);
    const clinicConfig = inject(ClinicConfigService);
    this.miliPage.set(inject(Router).url.split(/[?#]/)[0] === '/mili');
    inject(Router).events.subscribe(e => {
      if (e instanceof NavigationStart) { this.navigating.set(true); this.failedNavigation.set(null); }
      if (e instanceof NavigationError) this.failedNavigation.set(e.url);
      if (e instanceof NavigationEnd || e instanceof NavigationCancel || e instanceof NavigationError) this.navigating.set(false);
      if (e instanceof NavigationEnd) this.miliPage.set(e.urlAfterRedirects.split(/[?#]/)[0] === '/mili');
      if (e instanceof NavigationEnd && typeof window !== 'undefined') {
        const isClinicAdminRoute =
          e.urlAfterRedirects === '/business/clinic' ||
          e.urlAfterRedirects.startsWith('/business/clinic/');
        if (e.urlAfterRedirects.startsWith('/business') && !isClinicAdminRoute) {
          clinicConfig.resetToPlatformTheme();
        }
      }
    });
  }
}
