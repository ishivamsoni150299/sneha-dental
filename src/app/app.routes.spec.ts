import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';

@Component({ template: '' })
class RouteDestinationComponent {}

describe('application route configuration', () => {
  it('validates the full configuration in development mode', () => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
    expect(() => TestBed.inject(Router)).not.toThrow();
  });

  for (const platformHost of [true, false]) {
    it(`keeps the correct home destination when platform host is ${platformHost}`, async () => {
      TestBed.configureTestingModule({ providers: [provideRouter([
        { ...routes[0], canMatch: [() => platformHost] },
        { path: 'mili', component: RouteDestinationComponent },
        { path: '', component: RouteDestinationComponent },
      ])] });
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/');
      expect(TestBed.inject(Router).url).toBe(platformHost ? '/mili' : '/');
    });
  }
});
