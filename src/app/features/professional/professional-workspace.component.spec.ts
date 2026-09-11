import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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
});
