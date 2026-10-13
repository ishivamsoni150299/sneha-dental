import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MiliBookingComponent } from './mili-booking.component';
import { MarketplaceBookingComponent } from '../../../features/marketplace/marketplace-booking.component';
import { signal } from '@angular/core';

describe('MiliBookingComponent', () => {
  const dentist = { id: 'clinic', slug: 'smile', clinicName: 'Smile', dentistName: 'Dr Test', city: 'Noida', locality: 'Sector 75', consultationFee: 500, acceptingNewPatients: true };
  const response = (dentists = [dentist]) => ({ ok: true, json: async () => ({ dentists, totalCount: dentists.length }) }) as Response;
  async function setup() {
    const fetch = spyOn(window, 'fetch').and.resolveTo(response());
    await TestBed.configureTestingModule({ imports: [MiliBookingComponent], providers: [provideRouter([])] }).compileComponents();
    const fixture = TestBed.createComponent(MiliBookingComponent);
    fixture.detectChanges(); await fixture.whenStable();
    return { fixture, component: fixture.componentInstance, fetch };
  }
  it('uses verified public search with accepting-patient and pagination filters', async () => {
    const { component, fetch } = await setup();
    component.search.locality = 'Noida'; await component.find();
    const url = fetch.calls.mostRecent().args[0] as string;
    expect(url).toContain('locality=Noida'); expect(url).toContain('acceptingNewPatients=true'); expect(url).toContain('limit=6');
    expect(component.choices().length).toBe(1);
    expect(fetch.calls.allArgs().every(args => !args[1]?.method || args[1].method === 'GET')).toBeTrue();
  });
  it('ignores stale results after the search changes', async () => {
    const { component, fetch } = await setup();
    let finish!: (value: Response) => void;
    fetch.and.returnValue(new Promise(resolve => finish = resolve));
    const pending = component.find();
    fetch.and.resolveTo(response([])); await component.find();
    finish(response()); await pending;
    expect(component.choices()).toEqual([]);
  });
  it('does not leave or replace a booking while its submission is in progress', async () => {
    const { component, fetch } = await setup();
    component.select(dentist);
    component.checkout = { submitting: signal(true) } as unknown as MarketplaceBookingComponent;
    const finished = spyOn(component.finished, 'emit'); const calls = fetch.calls.count();
    component.close(); component.back(); await component.find();
    expect(finished).not.toHaveBeenCalled(); expect(component.selected()).toEqual(dentist); expect(fetch.calls.count()).toBe(calls);
  });
  it('keeps unavailable entries and unsafe slugs out of the choices', async () => {
    const { component, fetch } = await setup();
    fetch.and.resolveTo(response([{ ...dentist, acceptingNewPatients: false }, { ...dentist, slug: '../admin' }]));
    await component.find(); expect(component.choices()).toEqual([]);
  });
  it('tracks time and details separately and reopens times without replacing the checkout', async () => {
    const { component } = await setup();
    expect(component.step()).toBe(0);
    component.select(dentist);
    const editingTime = signal(false), submitting = signal(false);
    const setEditingTime = jasmine.createSpy('setEditingTime').and.callFake((value: boolean) => editingTime.set(value));
    component.checkout = { selectedSlot: signal(null), editingTime, submitting, setEditingTime } as unknown as MarketplaceBookingComponent;
    expect(component.step()).toBe(1); expect(component.changeTime()).toBeFalse();
    component.checkout.selectedSlot.set({ doctorId: 'd', doctorName: 'Dentist', date: '2026-10-14', time: '18:00' });
    expect(component.step()).toBe(2); expect(component.changeTime()).toBeTrue(); expect(component.step()).toBe(1);
    expect(component.selected()).toEqual(dentist);
    submitting.set(true); expect(component.changeTime()).toBeFalse(); expect(setEditingTime).toHaveBeenCalledTimes(1);
    component.receipt.set({ ref: 'saved', name: 'Patient', date: '2026-10-14', time: '18:00', service: 'Consultation' });
    expect(component.step()).toBe(3); expect(component.changeTime()).toBeFalse();
  });
  it('applies corrected criteria after the agent finishes without accepting a stale selection', async () => {
    const { component, fixture, fetch } = await setup();
    fixture.componentRef.setInput('updating', true); fixture.detectChanges();
    component.select(dentist); expect(component.selected()).toBeNull();
    const calls = fetch.calls.count();
    fixture.componentRef.setInput('criteria', { query: '', locality: 'Delhi', date: '', period: 'evening' });
    fixture.detectChanges(); expect(fetch.calls.count()).toBe(calls);
    fixture.componentRef.setInput('updating', false); fixture.detectChanges(); await fixture.whenStable();
    expect(component.applied.locality).toBe('Delhi'); expect(component.applied.period).toBe('evening');
    expect(fetch.calls.mostRecent().args[0] as string).toContain('locality=Delhi');
  });
});
