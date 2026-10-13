import { TestBed } from '@angular/core/testing';
import { NavigationStart, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { AuthFacade } from '../../core/services/auth-facade.service';
import { MarketplaceLayoutComponent } from './marketplace-layout.component';

describe('Marketplace navigation', () => {
  it('closes the mobile dialog when browser history starts another navigation', () => {
    const events = new Subject();
    TestBed.configureTestingModule({ providers: [
      { provide: Router, useValue: { events } },
      { provide: AuthFacade, useValue: {} },
    ] });
    const component = TestBed.runInInjectionContext(() => new MarketplaceLayoutComponent());
    component.openMenu();
    expect(component.menuOpen()).toBeTrue();
    events.next(new NavigationStart(1, '/appointments', 'popstate'));
    expect(component.menuOpen()).toBeFalse();
  });
});
