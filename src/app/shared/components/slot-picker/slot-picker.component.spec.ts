import { TestBed } from '@angular/core/testing';
import { MarketplaceService, type MarketplaceAvailability } from '../../../core/services/marketplace.service';
import { SlotPickerComponent } from './slot-picker.component';

describe('SlotPickerComponent', () => {
  const availability: MarketplaceAvailability = {
    dentistSlug: 'sample', timezone: 'Asia/Kolkata', days: [
      { date: '2026-09-08', slots: [{ doctorId: 'one', doctorName: 'Dr. One', time: '10:00', startsAt: '2026-09-08T10:00:00+05:30' }] },
      { date: '2026-09-09', slots: [{ doctorId: 'one', doctorName: 'Dr. One', time: '11:00', startsAt: '2026-09-09T11:00:00+05:30' }] },
    ],
  };

  async function setup(failed = false) {
    const service = jasmine.createSpyObj<MarketplaceService>('MarketplaceService', ['getAvailability']);
    if (failed) service.getAvailability.and.rejectWith(new Error('Offline'));
    else service.getAvailability.and.resolveTo(availability);
    await TestBed.configureTestingModule({ imports: [SlotPickerComponent], providers: [{ provide: MarketplaceService, useValue: service }] }).compileComponents();
    const fixture = TestBed.createComponent(SlotPickerComponent);
    fixture.componentRef.setInput('slug', 'sample');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, service };
  }

  it('clears a selected time when the patient switches dates', async () => {
    const { fixture, component } = await setup();
    const selected = spyOn(component.slotSelected, 'emit');
    const cleared = spyOn(component.slotCleared, 'emit');
    component.selectSlot(availability.days[0].slots[0], availability.days[0]);
    expect(selected).toHaveBeenCalledWith(jasmine.objectContaining({ date: '2026-09-08', time: '10:00' }));
    (fixture.nativeElement.querySelectorAll('[aria-label="Appointment dates"] button')[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(cleared).toHaveBeenCalledTimes(1);
    expect(component.selectedSlotKey()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('11:00 AM');
  });

  it('keeps the selected time when the same date is pressed again', async () => {
    const { component } = await setup();
    component.selectSlot(availability.days[0].slots[0], availability.days[0]);
    component.selectDate(0);
    expect(component.isSelected(availability.days[0], availability.days[0].slots[0])).toBeTrue();
  });

  it('recovers from an availability error using the retry control', async () => {
    const { fixture, component, service } = await setup(true);
    expect(fixture.nativeElement.textContent).toContain('Could not load available times');
    service.getAvailability.and.resolveTo(availability);
    (fixture.nativeElement.querySelector('[role="alert"] button') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.error()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('10:00 AM');
  });
});
