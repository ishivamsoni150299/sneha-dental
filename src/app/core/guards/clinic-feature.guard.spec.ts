import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { PlatformFeatureId, PlatformPlanId } from '../config/clinic.config';
import { ClinicConfigService } from '../services/clinic-config.service';
import { clinicFeatureGuard } from './clinic-feature.guard';

describe('clinicFeatureGuard', () => {
  let router: jasmine.SpyObj<Router>;

  function run(
    feature: PlatformFeatureId | undefined,
    plan: PlatformPlanId = 'trial',
    status: 'trial' | 'pending' | 'active' | 'expired' | 'cancelled' = 'trial',
  ) {
    TestBed.resetTestingModule();
    router = jasmine.createSpyObj('Router', ['createUrlTree']);
    router.createUrlTree.and.returnValue({ redirected: true } as never);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ClinicConfigService,
          useValue: { config: { subscriptionPlan: plan, subscriptionStatus: status } },
        },
        { provide: Router, useValue: router },
      ],
    });

    return TestBed.runInInjectionContext(() => clinicFeatureGuard({
      data: feature ? { platformFeature: feature } : {},
    } as never, {} as never));
  }

  it('allows routes without a declared feature', () => {
    expect(run(undefined)).toBeTrue();
  });

  it('redirects Free clinics away from Basic routes', () => {
    expect(run('patientRecords')).not.toBeTrue();
    expect(router.createUrlTree).toHaveBeenCalledWith(['/business/clinic/settings'], {
      queryParams: { tab: 'subscription', requiredFeature: 'patientRecords' },
    });
  });

  it('allows active Basic clinics to manage patients and doctors', () => {
    expect(run('patientRecords', 'starter', 'active')).toBeTrue();
    expect(run('doctorManagement', 'starter', 'active')).toBeTrue();
  });

  it('does not grant paid access while checkout is pending', () => {
    expect(run('patientRecords', 'starter', 'pending')).not.toBeTrue();
  });

  it('reserves AI voice and revenue insights for active Pro clinics', () => {
    expect(run('aiVoiceReceptionist', 'starter', 'active')).not.toBeTrue();
    expect(run('aiVoiceReceptionist', 'pro', 'active')).toBeTrue();
    expect(run('revenueInsights', 'pro', 'active')).toBeTrue();
  });
});