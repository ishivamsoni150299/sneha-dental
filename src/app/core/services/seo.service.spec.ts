import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { ClinicConfigService } from './clinic-config.service';
import type { MarketplaceClinic } from './marketplace.service';
import { SeoService } from './seo.service';

describe('Public profile SEO', () => {
  let service: SeoService;
  let events: Subject<NavigationEnd>;
  let router: { url: string; events: Subject<NavigationEnd> };
  const profile = {
    profileEntity: 'dentist', marketplaceSlug: 'asha-verma', name: 'Dr Asha', doctorName: 'Dr Asha', city: 'Pune',
    practiceLocations: [{ name: 'Pune Clinic', clinicSlug: 'pune-clinic' }],
  } as unknown as MarketplaceClinic;
  beforeEach(() => {
    events = new Subject(); router = { url: '/dentist/asha-verma', events };
    TestBed.configureTestingModule({ providers: [
      SeoService, { provide: Router, useValue: router },
      { provide: ActivatedRoute, useValue: { snapshot: { data: {} } } },
      { provide: ClinicConfigService, useValue: { config: { name: '', city: '' } } },
    ] });
    service = TestBed.inject(SeoService);
  });
  afterEach(() => { events.complete(); document.getElementById('seo-schema')?.remove(); TestBed.resetTestingModule(); });
  it('sets person identity, canonical and social URL, and survives navigation completion', () => {
    service.setPublicProfile(profile);
    events.next(new NavigationEnd(1, router.url, router.url));
    expect(document.title).toBe('Dr Asha, Dentist in Pune | My Dental Platform');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://mydentalplatform.com/dentist/asha-verma');
    expect(document.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe('https://mydentalplatform.com/dentist/asha-verma');
    const schema = JSON.parse(document.getElementById('seo-schema')!.textContent!);
    expect(schema['@graph'][0]['@type']).toBe('Person');
    expect(schema['@graph'][0].affiliation[0].url).toBe('https://mydentalplatform.com/clinic/pune-clinic');
    expect(schema['@graph'].some((entity: Record<string, unknown>) => entity['@type'] === 'FAQPage')).toBeFalse();
    expect(document.querySelector('meta[name="geo.position"]')).toBeNull();
  });
  it('clears previous identity on unavailable profile and when navigating to another profile', () => {
    service.setPublicProfile(profile); service.publicProfileUnavailable();
    expect(document.getElementById('seo-schema')).toBeNull();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toContain('noindex');
    service.setPublicProfile(profile); router.url = '/clinic/another-clinic';
    events.next(new NavigationEnd(2, router.url, router.url));
    expect(document.getElementById('seo-schema')).toBeNull();
    expect(document.title).not.toContain('Dr Asha');
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toContain('noindex');
  });
});
