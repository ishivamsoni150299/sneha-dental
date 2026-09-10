import { TestBed } from '@angular/core/testing';
import { AdminDashboardComponent } from './admin-dashboard.component';
import { AppointmentService, Appointment } from '../../../core/services/appointment.service';
import { DoctorService, Doctor, DEFAULT_SCHEDULE } from '../../../core/services/doctor.service';
import { ClinicConfigService } from '../../../core/services/clinic-config.service';
import { ClinicApiService } from '../../../core/services/clinic-api.service';

describe('Clinic appointment scheduling', () => {
  let component: AdminDashboardComponent;
  const appointment: Appointment = { id: 'appt', clinicId: 'clinic', bookingRef: 'BK-TEST', name: 'Patient',
    phone: '9999999999', service: 'Cleaning', date: '2026-09-14', time: '09:00', doctorId: 'doctor', status: 'confirmed' };
  const doctor: Doctor = { id: 'doctor', name: 'Dr Test', qualification: 'BDS', speciality: '', available: true,
    schedule: structuredClone(DEFAULT_SCHEDULE) };
  let appointments: jasmine.SpyObj<AppointmentService>;
  let doctors: jasmine.SpyObj<DoctorService>;

  beforeEach(() => {
    appointments = jasmine.createSpyObj('AppointmentService', ['reschedule', 'setStatus']);
    doctors = jasmine.createSpyObj('DoctorService', ['getDoctors', 'getAvailableSlots']);
    doctors.getDoctors.and.resolveTo([doctor]);
    doctors.getAvailableSlots.and.resolveTo(['10:00']);
    TestBed.configureTestingModule({ providers: [
      { provide: AppointmentService, useValue: appointments },
      { provide: DoctorService, useValue: doctors },
      { provide: ClinicApiService, useValue: {} },
      { provide: ClinicConfigService, useValue: { config: { clinicId: 'clinic' } } },
    ] });
    component = TestBed.runInInjectionContext(() => new AdminDashboardComponent());
    component.appointments.set([appointment]);
    component.detailAppt.set(appointment);
  });
  afterEach(() => component.ngOnDestroy());

  it('keeps the original appointment visible when a competing booking rejects rescheduling', async () => {
    await component.openReschedule(appointment);
    component.rescheduleTime = '10:00';
    appointments.reschedule.and.rejectWith(new Error('That slot was just booked.'));
    await component.saveReschedule();
    expect(component.detailAppt()?.time).toBe('09:00');
    expect(component.rescheduleTarget()).toBe(appointment);
    expect(component.rescheduleError()).toContain('just booked');
  });

  it('updates the detail and list only after the server accepts the new time', async () => {
    await component.openReschedule(appointment);
    component.rescheduleTime = '10:00';
    appointments.reschedule.and.resolveTo();
    await component.saveReschedule();
    expect(appointments.reschedule).toHaveBeenCalledWith('appt', '2026-09-14', '10:00', 'doctor');
    expect(component.detailAppt()?.time).toBe('10:00');
    expect(component.appointments()[0].status).toBe('confirmed');
    expect(component.rescheduleTarget()).toBeNull();
  });

  it('does not display completed when the server rejects the status change', async () => {
    appointments.setStatus.and.rejectWith(new Error('Refresh the appointment.'));
    await component.markCompleted(appointment);
    expect(component.detailAppt()?.status).toBe('confirmed');
    expect(component.actionError()).toContain('Refresh');
  });

  it('ignores an older availability response after the date changes', async () => {
    await component.openReschedule(appointment);
    let finishOld!: (slots: string[]) => void;
    doctors.getAvailableSlots.and.returnValue(new Promise(resolve => { finishOld = resolve; }));
    const old = component.loadRescheduleSlots();
    component.rescheduleDate = '2026-09-15';
    doctors.getAvailableSlots.and.resolveTo(['14:00']);
    await component.loadRescheduleSlots();
    finishOld(['11:00']);
    await old;
    expect(component.rescheduleSlots()).toEqual(['14:00']);
  });
});
