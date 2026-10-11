import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthFacade, PlatformUser } from '../../../core/services/auth-facade.service';
import { AuthenticatedApiService } from '../../../core/services/authenticated-api.service';
import { PlatformAgentComponent } from './platform-agent.component';

describe('PlatformAgentComponent', () => {
  let fixture: ComponentFixture<PlatformAgentComponent>;
  let component: PlatformAgentComponent;
  let api: jasmine.SpyObj<AuthenticatedApiService>;
  let router: jasmine.SpyObj<Router>;
  let currentUser: ReturnType<typeof signal<PlatformUser | null>>;
  let refresh: jasmine.Spy;
  const owner: PlatformUser = { uid: 'owner', email: 'owner@example.test', emailVerified: true, phoneNumber: null, clinicId: null };
  const draft = { status: 'needs_confirmation' as const, message: 'Review before creating.', draftId: 'draft-1',
    draft: { name: 'My clinic', phone: '9999999999', city: 'Delhi', slug: 'myclinic', plan: 'trial' } };

  beforeEach(async () => {
    spyOn(window, 'fetch').and.resolveTo(new Response(JSON.stringify({ available: true })));
    currentUser = signal<PlatformUser | null>(owner);
    api = jasmine.createSpyObj<AuthenticatedApiService>('api', ['fetch']);
    router = jasmine.createSpyObj<Router>('router', ['navigateByUrl']);
    router.navigateByUrl.and.resolveTo(true);
    refresh = jasmine.createSpy('resolveCurrentUser').and.resolveTo('clinic-admin');
    await TestBed.configureTestingModule({ imports: [PlatformAgentComponent], providers: [
      { provide: AuthenticatedApiService, useValue: api }, { provide: Router, useValue: router },
      { provide: AuthFacade, useValue: { currentUser, resolveCurrentUser: refresh } },
    ] }).compileComponents();
    fixture = TestBed.createComponent(PlatformAgentComponent); component = fixture.componentInstance;
    fixture.detectChanges(); await fixture.whenStable();
  });

  it('opens a permitted page from an authenticated action result', async () => {
    api.fetch.and.resolveTo(new Response(JSON.stringify({ status: 'navigate', path: '/appointments', message: 'Opening appointments.' })));
    await component.send('open my appointments');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/appointments');
    expect(component.busy()).toBeFalse();
  });
  it('rejects arbitrary destinations returned by an unexpected response', async () => {
    api.fetch.and.resolveTo(new Response(JSON.stringify({ status: 'navigate', path: 'https://evil.example', message: 'Opening.' })));
    await component.send('open appointments');
    expect(router.navigateByUrl).not.toHaveBeenCalled(); expect(component.error()).toContain('not supported');
  });
  it('only saves a draft after a separate confirmation', async () => {
    api.fetch.and.resolveTo(new Response(JSON.stringify(draft)));
    await component.send('create a clinic');
    expect(api.fetch).toHaveBeenCalledTimes(1); expect(component.result()?.draftId).toBe('draft-1');
    api.fetch.and.resolveTo(new Response(JSON.stringify({ status: 'succeeded', message: 'Created.', path: '/business/clinic/dashboard', refreshSession: true })));
    await component.confirm();
    expect(api.fetch).toHaveBeenCalledWith('/api/agent/drafts/draft-1/confirm', { method: 'POST' });
    expect(refresh).toHaveBeenCalled(); expect(router.navigateByUrl).toHaveBeenCalledWith('/business/clinic/dashboard');
  });
  it('passes the prior draft for invalidation when the user corrects details', async () => {
    component.result.set(draft);
    api.fetch.and.resolveTo(new Response(JSON.stringify({ status: 'needs_input', message: 'Which city?' })));
    await component.send('change the clinic name');
    const request = api.fetch.calls.mostRecent().args[1];
    expect(JSON.parse(request?.body as string).draftId).toBe('draft-1');
    expect(component.result()?.draftId).toBeUndefined();
  });
  it('ignores an old account response after logout', async () => {
    let finish!: (value: Response) => void;
    api.fetch.and.returnValue(new Promise(resolve => { finish = resolve; }));
    const pending = component.send('open appointments');
    currentUser.set(null); fixture.detectChanges();
    finish(new Response(JSON.stringify({ status: 'navigate', path: '/appointments', message: 'Opening.' })));
    await pending;
    expect(router.navigateByUrl).not.toHaveBeenCalled(); expect(component.messages()).toEqual([]);
  });
  it('keeps a draft available when confirmation fails', async () => {
    component.result.set(draft);
    api.fetch.and.resolveTo(new Response(JSON.stringify({ detail: 'Connection unavailable. Check your workspace.' }), { status: 502 }));
    await component.confirm();
    expect(component.result()?.draftId).toBe('draft-1'); expect(component.error()).toContain('Check your workspace');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });
  it('clears a draft after successful cancellation', async () => {
    component.result.set(draft); api.fetch.and.resolveTo(new Response(null, { status: 204 }));
    await component.cancel(); expect(component.result()).toBeNull();
  });
});
