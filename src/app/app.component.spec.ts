import { TestBed } from '@angular/core/testing';
import { NavigationEnd, NavigationError, NavigationStart, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { AppComponent } from './app.component';
import { SeoService } from './core/services/seo.service';
import { AnalyticsService } from './core/services/analytics.service';
import { ClinicConfigService } from './core/services/clinic-config.service';

describe('Page navigation recovery', () => {
  it('retries a failed destination and clears the message on the next navigation', () => {
    const events = new Subject();
    const navigateByUrl = jasmine.createSpy('navigateByUrl').and.resolveTo(true);
    TestBed.configureTestingModule({ providers: [
      { provide: Router, useValue: { url: '/mili', events, navigateByUrl } },
      { provide: SeoService, useValue: {} },
      { provide: AnalyticsService, useValue: {} },
      { provide: ClinicConfigService, useValue: {} },
    ] });
    const component = TestBed.runInInjectionContext(() => new AppComponent());
    events.next(new NavigationStart(1, '/dentists'));
    events.next(new NavigationError(1, '/dentists', new Error('Chunk unavailable')));
    expect(component.navigating()).toBeFalse();
    expect(component.miliPage()).toBeTrue();
    component.retryNavigation();
    expect(navigateByUrl).toHaveBeenCalledOnceWith('/dentists');
    events.next(new NavigationStart(2, '/dentists'));
    expect(component.failedNavigation()).toBeNull();
    events.next(new NavigationEnd(2, '/dentists', '/dentists'));
    expect(component.miliPage()).toBeFalse();
  });
});
