import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { AuthFacade, AuthRole, PlatformUser } from '../../../core/services/auth-facade.service';
import { AuthenticatedApiService } from '../../../core/services/authenticated-api.service';
import { PlatformAgentComponent } from './platform-agent.component';
import { MiliBookingComponent } from './mili-booking.component';

describe('PlatformAgentComponent', () => {
  let fixture: ComponentFixture<PlatformAgentComponent>;
  let component: PlatformAgentComponent;
  let api: jasmine.SpyObj<AuthenticatedApiService>;
  let router: jasmine.SpyObj<Router>;
  let currentUser: ReturnType<typeof signal<PlatformUser | null>>;
  let refresh: jasmine.Spy;
  let role: ReturnType<typeof signal<AuthRole | null>>;
  const owner: PlatformUser = { uid: 'owner', email: 'owner@example.test', emailVerified: true, phoneNumber: null, clinicId: null };
  const draft = { status: 'needs_confirmation' as const, message: 'Review before creating.', draftId: 'draft-1',
    draft: { name: 'My clinic', phone: '9999999999', city: 'Delhi', slug: 'myclinic', plan: 'trial' } };

  beforeEach(async () => {
    spyOn(window, 'fetch').and.resolveTo({ ok: true, json: async () => ({ available: true }) } as Response);
    currentUser = signal<PlatformUser | null>(owner);
    role = signal<AuthRole | null>('incomplete-signup');
    api = jasmine.createSpyObj<AuthenticatedApiService>('api', ['fetch']);
    refresh = jasmine.createSpy('resolveCurrentUser').and.resolveTo('clinic-admin');
    await TestBed.configureTestingModule({ imports: [PlatformAgentComponent], providers: [
      { provide: AuthenticatedApiService, useValue: api }, provideRouter([]),
      { provide: AuthFacade, useValue: { currentUser, role, resolveCurrentUser: refresh } },
    ] }).compileComponents();
    router = TestBed.inject(Router) as jasmine.SpyObj<Router>;
    spyOn(router, 'navigateByUrl').and.resolveTo(true);
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
    expect(refresh).toHaveBeenCalled(); expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(component.result()?.status).toBe('succeeded');
  });
  it('passes the prior draft for invalidation when the user corrects details', async () => {
    component.result.set(draft);
    api.fetch.and.resolveTo(new Response(JSON.stringify({ status: 'needs_input', message: 'Which city?' })));
    await component.send('change the clinic name');
    const request = api.fetch.calls.mostRecent().args[1];
    expect(JSON.parse(request?.body as string).draftId).toBe('draft-1');
    expect(JSON.parse(request?.body as string).history.join(' ')).toContain('My clinic');
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

  it('opens a shortcut directly without a model request', async () => {
    role.set('patient');
    await component.choose(component.shortcuts()[1]);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/appointments');
    expect(api.fetch).not.toHaveBeenCalled();
    expect(component.taskStatus()).toBe('Page opened');
  });
  it('offers clinic setup only to eligible accounts', () => {
    expect(component.shortcuts().some(item => item.title === 'Set up my clinic')).toBeTrue();
    role.set('dentist');
    expect(component.shortcuts().some(item => item.title === 'Set up my clinic')).toBeFalse();
  });
  it('does not report a blocked navigation as complete', async () => {
    router.navigateByUrl.and.resolveTo(false);
    await component.choose({ title: 'Appointments', path: '/appointments' });
    expect(component.result()).toBeNull();
    expect(component.taskStatus()).toBe('Needs attention');
  });
  it('recognizes a page that is already open', async () => {
    Object.defineProperty(router, 'url', { value: '/appointments', configurable: true });
    router.navigateByUrl.and.resolveTo(false);
    await component.choose({ title: 'Appointments', path: '/appointments' });
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(component.taskStatus()).toBe('Page opened');
  });
  it('requires a revised draft to be reviewed before confirmation', async () => {
    component.result.set(draft); component.beginEdit();
    component.editDraft.city = 'Noida';
    await component.confirm(); expect(api.fetch).not.toHaveBeenCalled();
    api.fetch.and.resolveTo(new Response(JSON.stringify({ ...draft, draftId: 'draft-2', draft: { ...draft.draft, city: 'Noida' } })));
    await component.saveEdit();
    expect(api.fetch.calls.mostRecent().args[1]?.method).toBe('PUT');
    expect(component.result()?.draftId).toBe('draft-2');
    expect(component.result()?.draft?.city).toBe('Noida');
    expect(component.editing()).toBeFalse();
    expect(component.taskStatus()).toBe('Review before creating');
  });
  it('preserves edits and the original draft when validation fails', async () => {
    component.result.set(draft); component.beginEdit(); component.editDraft.slug = 'taken';
    api.fetch.and.resolveTo(new Response(JSON.stringify({ detail: 'That clinic web address is taken.' }), { status: 400 }));
    await component.saveEdit();
    expect(component.editing()).toBeTrue(); expect(component.editDraft.slug).toBe('taken');
    expect(component.result()?.draftId).toBe('draft-1');
  });
  it('starts a fresh conversation without silently discarding a pending draft', () => {
    component.result.set(draft); component.newTask();
    expect(component.result()?.draftId).toBe('draft-1');
    component.result.set({ status: 'navigate', message: 'Opened.', path: '/appointments' });
    component.messages.set([{ role: 'user', text: 'old task' }]); component.newTask();
    expect(component.messages()).toEqual([]); expect(component.result()).toBeNull();
  });
  it('renders Mili as the main page without an empty task panel or floating launcher', () => {
    fixture.componentRef.setInput('mainPage', true); fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector('main, [role="main"]')).not.toBeNull();
    expect(page.querySelector('h1')?.textContent).toContain('Mili');
    expect(page.querySelector('.mili-launcher')).toBeNull();
    expect(page.querySelector('.task-canvas')).toBeNull();
  });
  it('keeps direct tasks usable when AI is unavailable', async () => {
    fixture.componentRef.setInput('mainPage', true); component.available.set(false); role.set('patient'); fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Voice and AI requests are currently unavailable');
    await component.choose(component.shortcuts()[0]);
    expect(component.result()?.status).toBe('booking');
    expect(router.navigateByUrl).not.toHaveBeenCalled(); expect(api.fetch).not.toHaveBeenCalled();
  });
  it('keeps a pending review when returning to the main page', () => {
    component.result.set(draft);
    fixture.componentRef.setInput('mainPage', false); fixture.detectChanges();
    fixture.componentRef.setInput('mainPage', true); fixture.detectChanges();
    expect(component.result()?.draftId).toBe('draft-1');
    expect((fixture.nativeElement as HTMLElement).querySelector('.draft')).not.toBeNull();
  });
  it('keeps the current search while applying a correction and includes its preferences', async () => {
    const booking = { query: 'cleaning', locality: 'Noida', date: '', period: 'any' as const };
    component.result.set({ status: 'booking', message: 'Choose a dentist.', booking });
    let finish!: (value: Response) => void;
    api.fetch.and.returnValue(new Promise(resolve => { finish = resolve; }));
    const pending = component.send('make it evening');
    expect(component.result()?.booking).toEqual(booking);
    expect(JSON.parse(api.fetch.calls.mostRecent().args[1]?.body as string).booking.locality).toBe('Noida');
    finish(new Response(JSON.stringify({ status: 'booking', message: 'Evening times.', booking: { ...booking, period: 'evening' } })));
    await pending;
    expect(component.result()?.booking?.period).toBe('evening');
  });
  it('preserves a search on failed or clarification-only corrections', async () => {
    const booking = { query: '', locality: 'Delhi', date: '', period: 'any' as const };
    component.result.set({ status: 'booking', message: 'Choose.', booking });
    api.fetch.and.resolveTo(new Response(JSON.stringify({ detail: 'Try again.' }), { status: 502 }));
    await component.send('Friday'); expect(component.result()?.booking).toEqual(booking);
    api.fetch.and.resolveTo(new Response(JSON.stringify({ status: 'needs_input', message: 'Which Friday?' })));
    await component.send('Friday'); expect(component.result()?.booking).toEqual(booking);
    expect(component.latestReply()).toBe('Which Friday?');
  });
  it('does not reinterpret a completed booking as a new request', async () => {
    component.result.set({ status: 'booking', message: 'Choose.', booking: { query: '', locality: '', date: '', period: 'any' } });
    component.bookingSent.set(true);
    await component.send('make it Friday');
    expect(api.fetch).not.toHaveBeenCalled();
    expect(component.latestReply()).toContain('already sent');
  });
  it('opens the current time picker for an explicit correction without a model or save request', async () => {
    const changeTime = jasmine.createSpy('changeTime').and.returnValue(true);
    component.bookingCard = { selected: signal({ slug: 'clinic' }), changeTime } as unknown as MiliBookingComponent;
    component.result.set({ status: 'booking', message: 'Choose.', booking: { query: '', locality: '', date: '', period: 'any' } });
    await component.send('please change the time');
    expect(changeTime).toHaveBeenCalledTimes(1); expect(api.fetch).not.toHaveBeenCalled();
    expect(component.latestReply()).toContain('Your details are kept');
    expect(component.commandPlaceholder()).toContain('change the time');
  });
  it('replaces stale editing guidance with the actual submitted outcome', () => {
    component.messages.set([{ role: 'assistant', text: 'Choose a new time.' }]);
    component.onBookingSent();
    expect(component.bookingSent()).toBeTrue();
    expect(component.latestReply()).toContain('Your request was sent');
    expect(component.latestReply()).toContain('will confirm');
  });
});
