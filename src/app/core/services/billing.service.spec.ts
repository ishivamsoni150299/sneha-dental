import { TestBed } from '@angular/core/testing';
import { BillingService } from './billing.service';
import { AuthenticatedApiService } from './authenticated-api.service';

describe('BillingService', () => {
  let api: jasmine.SpyObj<AuthenticatedApiService>;
  let service: BillingService;
  beforeEach(() => {
    api = jasmine.createSpyObj('AuthenticatedApiService', ['fetch']);
    TestBed.configureTestingModule({ providers: [{ provide: AuthenticatedApiService, useValue: api }] });
    service = TestBed.inject(BillingService);
  });
  it('surfaces server guidance when another checkout already exists', async () => {
    api.fetch.and.resolveTo(new Response(JSON.stringify({ detail: 'Manage the existing subscription first.' }), { status: 409 }));
    await expectAsync(service.createSubscription('clinic', 'starter', 'monthly', 'Clinic')).toBeRejectedWithError('Manage the existing subscription first.');
  });
  it('rejects unsafe payment links', async () => {
    api.fetch.and.resolveTo(new Response(JSON.stringify({ paymentUrl: 'javascript:alert(1)' })));
    await expectAsync(service.createSubscription('clinic', 'starter', 'monthly', 'Clinic')).toBeRejectedWithError('Invalid payment link. Contact billing support.');
  });
  it('checks provider status through the authenticated refresh endpoint', async () => {
    api.fetch.and.resolveTo(new Response(JSON.stringify({ status: 'active', plan: 'starter' })));
    expect((await service.refreshSubscription()).status).toBe('active');
    expect(api.fetch).toHaveBeenCalledWith('/api/billing/subscriptions/current/refresh', { method: 'POST' });
  });
});
