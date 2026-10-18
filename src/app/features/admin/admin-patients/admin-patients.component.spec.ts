import { TestBed } from '@angular/core/testing';
import { Appointment, AppointmentService } from '../../../core/services/appointment.service';
import { ClinicConfigService } from '../../../core/services/clinic-config.service';
import { AdminPatientsComponent } from './admin-patients.component';

describe('Clinic patient records', () => {
  let component: AdminPatientsComponent;
  let api: jasmine.SpyObj<AppointmentService>;
  beforeEach(() => {
    api = jasmine.createSpyObj('Appointments', ['getAllAppointments']);
    TestBed.configureTestingModule({ providers: [
      { provide: AppointmentService, useValue: api },
      { provide: ClinicConfigService, useValue: { config: {} } },
    ] });
    component = TestBed.runInInjectionContext(() => new AdminPatientsComponent());
  });
  it('clears failed-load feedback when retry succeeds', async () => {
    api.getAllAppointments.and.rejectWith(new Error('Offline'));
    await component.ngOnInit();
    expect(component.error()).toBeTruthy();
    api.getAllAppointments.and.resolveTo([]);
    await component.ngOnInit();
    expect(component.error()).toBeNull();
    expect(component.loading()).toBeFalse();
  });
  it('uses the clinic day and the earliest time for the next visit', () => {
    jasmine.clock().install();
    try {
      jasmine.clock().mockDate(new Date('2027-01-01T20:00:00Z'));
      component.allAppts.set([
        { phone: '9999999999', name: 'Patient', status: 'confirmed', date: '2027-01-01', time: '10:00' },
        { phone: '9999999999', name: 'Patient', status: 'confirmed', date: '2027-01-02', time: '16:00' },
        { phone: '9999999999', name: 'Patient', status: 'confirmed', date: '2027-01-02', time: '09:00' },
      ] as Appointment[]);
      expect(component.patients()[0].nextAppointment?.date).toBe('2027-01-02');
      expect(component.patients()[0].nextAppointment?.time).toBe('09:00');
    } finally { jasmine.clock().uninstall(); }
  });
});
