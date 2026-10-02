/// <reference types="jasmine" />

import { TestBed } from '@angular/core/testing';
import { ClinicApiService, AppointmentDoc } from '../../../core/services/clinic-api.service';
import { AnalyticsComponent } from './analytics.component';

describe('Analytics lifecycle totals', () => {
  it('includes every appointment status in the visible breakdown', () => {
    TestBed.configureTestingModule({ providers: [{ provide: ClinicApiService, useValue: {} }] });
    const component = TestBed.runInInjectionContext(() => new AnalyticsComponent());
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-05`;
    const statuses = ['pending', 'confirmed', 'checked_in', 'completed', 'no_show', 'cancelled', 'declined', 'expired'] as const;
    component.appointments.set(statuses.map((status, index) => ({ id: String(index), clinicId: 'clinic', name: 'Patient', phone: '919876543210', bookingRef: `BK-${index}`, service: 'Consultation', date, time: '09:00', status } as AppointmentDoc)));
    expect(component.statusRows().reduce((total, row) => total + row.count, 0)).toBe(component.totalThisMonth());
    expect(component.statusRows().find(row => row.label === 'Completed')?.count).toBe(1);
    expect(component.statusRows().find(row => row.label === 'No Show')?.count).toBe(1);
    expect(component.statusRows().find(row => row.label === 'Arrived')?.count).toBe(1);
  });
});