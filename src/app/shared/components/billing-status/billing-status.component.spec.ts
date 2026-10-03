import { TestBed } from '@angular/core/testing';
import { BillingStatusComponent } from './billing-status.component';
import { BillingService } from '../../../core/services/billing.service';
import { ClinicConfigService } from '../../../core/services/clinic-config.service';

describe('BillingStatusComponent', () => {
  const clinic = { updateConfig: jasmine.createSpy('updateConfig') };
  let billing: jasmine.SpyObj<BillingService>;
  beforeEach(() => {
    billing = jasmine.createSpyObj('BillingService', ['currentSubscription', 'refreshSubscription']);
    billing.currentSubscription.and.resolveTo({ plan: 'starter', status: 'pending', payments: [] });
    TestBed.configureTestingModule({ imports: [BillingStatusComponent], providers: [
      { provide: BillingService, useValue: billing }, { provide: ClinicConfigService, useValue: clinic },
    ] });
    clinic.updateConfig.calls.reset();
  });
  it('shows a real link while pending and updates access only from the server', async () => {
    const fixture = TestBed.createComponent(BillingStatusComponent);
    fixture.componentRef.setInput('checkoutUrl', 'https://rzp.io/test');
    fixture.detectChanges();
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a').getAttribute('href')).toBe('https://rzp.io/test');
    expect(fixture.nativeElement.textContent).toContain('awaiting confirmation');
    billing.refreshSubscription.and.resolveTo({ plan: 'starter', status: 'active', payments: [] });
    fixture.componentInstance.refresh();
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('paid plan is active');
    expect(clinic.updateConfig).toHaveBeenCalledWith(jasmine.objectContaining({ subscriptionStatus: 'active' }));
  });
  it('retains the link and allows retry after a provider outage', async () => {
    const fixture = TestBed.createComponent(BillingStatusComponent);
    fixture.componentRef.setInput('checkoutUrl', 'https://rzp.io/test');
    fixture.detectChanges(); await fixture.whenStable();
    billing.refreshSubscription.and.rejectWith(new Error('Provider unavailable'));
    fixture.componentInstance.refresh(); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain('Provider unavailable');
    expect(fixture.nativeElement.querySelector('a')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('button').disabled).toBeFalse();
  });
});
