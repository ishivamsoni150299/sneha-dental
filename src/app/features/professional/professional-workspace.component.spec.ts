import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthenticatedApiService } from '../../core/services/authenticated-api.service';
import { ProfessionalWorkspaceComponent } from './professional-workspace.component';

describe('ProfessionalWorkspaceComponent', () => {
  let api: jasmine.SpyObj<AuthenticatedApiService>;
  beforeEach(() => {
    api = jasmine.createSpyObj('AuthenticatedApiService', ['fetch']);
    TestBed.configureTestingModule({ imports: [ProfessionalWorkspaceComponent], providers: [provideRouter([]), { provide: AuthenticatedApiService, useValue: api }] });
  });
  it('loads existing breaks and days off and preserves them on save', async () => {
    const component = TestBed.createComponent(ProfessionalWorkspaceComponent).componentInstance;
    component.practices.set([{ id: 'location-1', name: 'Practice', city: 'Noida', status: 'active', schedule: JSON.stringify({ mon: { enabled: true, start: '09:00', end: '17:00', breaks: [{ start: '13:00', end: '14:00' }] }, daysOff: ['2026-12-25'] }) }]);
    component.selectLocation('location-1');
    expect(component.hours[0].breaks.length).toBe(1);
    expect(component.hours[1].enabled).toBeFalse();
    api.fetch.and.resolveTo(new Response('{}'));
    await component.saveSchedule();
    const body = JSON.parse(String(api.fetch.calls.mostRecent().args[1]?.body));
    expect(body.schedule.mon.breaks).toEqual([{ start: '13:00', end: '14:00' }]);
    expect(body.schedule.daysOff).toEqual(['2026-12-25']);
    expect(api.fetch.calls.mostRecent().args[0]).toBe('/api/providers/me/locations/location-1/schedule');
  });
  it('keeps schedule edits after a conflict and shows the error', async () => {
    const component = TestBed.createComponent(ProfessionalWorkspaceComponent).componentInstance;
    component.practices.set([{ id: 'location-1', name: 'Practice', city: 'Noida', status: 'active', schedule: {} }]);
    component.selectLocation('location-1');
    component.hours[0].enabled = true;
    api.fetch.and.resolveTo(new Response(JSON.stringify({ detail: 'Reschedule affected appointments first.' }), { status: 409 }));
    await component.saveSchedule();
    expect(component.error()).toContain('Reschedule');
    expect(component.hours[0].enabled).toBeTrue();
    expect(component.saving()).toBeFalse();
  });
  it('opens profile setup for an unverified dentist', async () => {
    api.fetch.and.callFake(async url => new Response(
      url === '/api/providers/me' ? JSON.stringify({ verificationStatus: 'draft', locations: [] }) : '[]',
      { headers: { 'Content-Type': 'application/json' } },
    ));
    const component = TestBed.createComponent(ProfessionalWorkspaceComponent).componentInstance;
    await component.ngOnInit();
    expect(component.tab()).toBe('profile');
    expect(component.hasBookableHours()).toBeFalse();
  });
  it('keeps the selected task in the URL for reloads', () => {
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    const component = TestBed.createComponent(ProfessionalWorkspaceComponent).componentInstance;
    component.selectTab('availability');
    expect(component.tab()).toBe('availability');
    expect(navigate).toHaveBeenCalledWith([], jasmine.objectContaining({ queryParams: { tab: 'availability' }, queryParamsHandling: 'merge' }));
    component.saving.set(true);
    component.selectTab('profile');
    expect(component.tab()).toBe('availability');
  });
  it('opens appointments for a verified dentist', async () => {
    api.fetch.and.callFake(async url => new Response(
      url === '/api/providers/me' ? JSON.stringify({ verificationStatus: 'verified', locations: [] }) : '[]',
      { headers: { 'Content-Type': 'application/json' } },
    ));
    const component = TestBed.createComponent(ProfessionalWorkspaceComponent).componentInstance;
    await component.ngOnInit();
    expect(component.tab()).toBe('appointments');
  });

  it('prioritizes pending requests and finds patients without another screen', () => {
    const component = TestBed.createComponent(ProfessionalWorkspaceComponent).componentInstance;
    const visit = { id: 'one', booking_ref: 'REF-ONE', patient_name: 'Asha', phone_e164: '+919999999999', service: 'Consultation', date: '2026-10-11', time: '10:00', status: 'confirmed', source: 'marketplace', location_name: 'Practice' };
    component.visits.set([visit, { ...visit, id: 'two', patient_name: 'Rahul', status: 'pending' }]);
    expect(component.visibleVisits()[0].id).toBe('two');
    component.search.set('asha');
    expect(component.visibleVisits().map(item => item.id)).toEqual(['one']);
  });
});
