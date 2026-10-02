import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AuthFacade } from '../../../core/services/auth-facade.service';
import { ClinicConfigService } from '../../../core/services/clinic-config.service';
import { ClinicWorkspaceComponent } from './clinic-workspace.component';
import { businessRoutes } from '../../../features/business/business.routes';

@Component({ standalone: true, template: '<h1>Section content</h1>' })
class SectionComponent {}

describe('ClinicWorkspaceComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'business/clinic', component: ClinicWorkspaceComponent, children: [
          { path: 'dashboard', component: SectionComponent },
          { path: 'patients', component: SectionComponent },
          { path: 'reviews', component: SectionComponent },
          { path: 'settings', component: SectionComponent },
          businessRoutes.find(route => route.path === 'clinic')!.children!.find(route => route.path === 'doctors')!,
        ] }]),
        { provide: ClinicConfigService, useValue: { config: { name: 'Test Clinic' } } },
        { provide: AuthFacade, useValue: { currentUser: signal({ email: 'clinic@example.com' }) } },
      ],
    });
  });

  it('keeps the shell and account menu while moving between clinic sections', async () => {
    const harness = await RouterTestingHarness.create('/business/clinic/dashboard');
    const shell = harness.routeNativeElement;
    for (const section of ['patients', 'reviews', 'settings']) {
      await harness.navigateByUrl(`/business/clinic/${section}`);
      expect(harness.routeNativeElement).toBe(shell);
      expect(shell?.querySelectorAll('app-clinic-account-menu').length).toBe(1);
      const active = shell?.querySelectorAll('nav a[aria-current="page"]');
      expect(active?.length).toBe(2);
      expect(active?.[0].getAttribute('href')).toBe(`/business/clinic/${section}`);
    }
  });

  it('keeps old Doctors links within settings with the selected tab', async () => {
    const harness = await RouterTestingHarness.create('/business/clinic/doctors');
    expect(harness.routeNativeElement?.querySelector('app-clinic-account-menu')).not.toBeNull();
    expect(TestBed.inject(Router).url).toBe('/business/clinic/settings?tab=doctors');
  });
});
