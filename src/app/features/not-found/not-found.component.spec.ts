import { DOCUMENT } from '@angular/core';

import { TestBed } from '@angular/core/testing';
import { ClinicConfigService } from '../../core/services/clinic-config.service';
import { NotFoundComponent } from './not-found.component';

describe('Page recovery destinations', () => {
  for (const [hostname, loaded, platform] of [
    ['mydentalplatform.com', true, true],
    ['mydentalplatform.onrender.com', false, true],
    ['smile.mydentalplatform.com', true, false],
    ['custom-clinic.example', true, false],
  ] as const) {
    it(`chooses the correct recovery links for ${hostname}`, () => {
      TestBed.configureTestingModule({ providers: [
        { provide: DOCUMENT, useValue: { location: { hostname } } },
        { provide: ClinicConfigService, useValue: { isLoaded: loaded } },
      ] });
      const component = TestBed.runInInjectionContext(() => new NotFoundComponent());
      expect(component.platformPage).toBe(platform);
    });
  }
});
