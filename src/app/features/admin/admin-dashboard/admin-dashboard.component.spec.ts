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
    appointments = jasmine.createSpyObj('AppointmentService', ['reschedule', 'setStatus', 'updateClinicalDetails']);
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

  it('prevents competing appointment updates until the current action finishes', async () => {
    let finish!: () => void;
    appointments.setStatus.and.returnValue(new Promise<void>(resolve => { finish = resolve; }));
    const updating = component.markArrived(appointment);
    await component.markCompleted(appointment);
    component.requestCancel(appointment);
    expect(appointments.setStatus).toHaveBeenCalledTimes(1);
    component.openDetail({ ...appointment, id: 'other-appointment' });
    expect(component.detailAppt()?.id).toBe(appointment.id);
    expect(component.cancelTarget()).toBeNull();
    finish();
    await updating;
    expect(component.detailAppt()?.status).toBe('checked_in');
    expect(component.updatingId()).toBeNull();
  });

  it('preserves the cancellation reason after a failure and closes after a successful retry', async () => {
    component.requestCancel(appointment);
    component.cancelReason.set('Patient request');
    appointments.setStatus.and.rejectWith(new Error('Connection lost. Please retry.'));
    await component.confirmCancel();
    expect(component.cancelTarget()?.id).toBe(appointment.id);
    expect(component.cancelReason()).toBe('Patient request');
    expect(component.cancelError()).toBe('Connection lost. Please retry.');
    expect(component.detailAppt()?.status).toBe('confirmed');
    appointments.setStatus.and.resolveTo();
    await component.confirmCancel();
    expect(component.cancelTarget()).toBeNull();
    expect(component.cancelError()).toBeNull();
    expect(component.detailAppt()?.status).toBe('cancelled');
  });

  it('keeps cancellation open and sends only one request during repeated taps', async () => {
    let finish!: () => void;
    appointments.setStatus.and.returnValue(new Promise<void>(resolve => { finish = resolve; }));
    component.requestCancel(appointment);
    component.cancelReason.set('Patient request');
    const saving = component.confirmCancel();
    component.dismissCancel();
    await component.confirmCancel();
    expect(component.cancelTarget()?.id).toBe(appointment.id);
    expect(appointments.setStatus).toHaveBeenCalledTimes(1);
    finish();
    await saving;
    expect(component.cancelTarget()).toBeNull();
  });

  it('opens today in time order and switches views without retaining hidden filters', () => {
    const early = { ...appointment, id: 'early', date: component.today, time: '09:00' };
    const late = { ...early, id: 'late', time: '14:30' };
    const request = { ...appointment, id: 'request', date: '2099-11-01', status: 'pending' as const };
    component.appointments.set([late, request, early]);
    expect(component.activeTab()).toBe('today');
    expect(component.filteredAppointments().map(a => a.id)).toEqual(['early', 'late']);
    component.searchQuery.set('not a patient');
    component.dateFrom.set('2099-12-01');
    component.selectView('pending');
    expect(component.searchQuery()).toBe('');
    expect(component.dateFrom()).toBe('');
    expect(component.filteredAppointments().map(a => a.id)).toEqual(['request']);
    expect(component.viewLabel()).toBe('Needs confirmation');
    component.selectView('all');
    expect(component.filteredAppointments().map(a => a.id)).toEqual(['request', 'late', 'early']);
    expect(component.appointments()).toEqual([late, request, early]);
  });

  it('lets a date preset expand beyond the default today view', () => {
    component.setDateQuick('month');
    expect(component.activeTab()).toBe('all');
    expect(component.dateFrom()).not.toBe('');
    expect(component.dateTo()).not.toBe('');
  });

  it('uses the amount received for partial collection and outstanding totals', () => {
    component.appointments.set([{ ...appointment, amountCharged: 1000, amountPaid: 400, paymentStatus: 'partial' }]);
    expect(component.paidRevenue()).toBe(400);
    expect(component.outstandingRevenue()).toBe(600);
  });

  it('saves zero charges and rejects an invalid partial payment', async () => {
    appointments.updateClinicalDetails.and.resolveTo();
    component.openDetail(appointment);
    component.setNotesAmount('0');
    await component.saveNotes();
    expect(appointments.updateClinicalDetails).toHaveBeenCalledWith('appt', jasmine.objectContaining({ amountCharged: 0 }));
    appointments.updateClinicalDetails.calls.reset();
    component.setNotesAmount('1000');
    component.setNotesPayStatus('partial');
    component.setNotesPaid('1200');
    await component.saveNotes();
    expect(appointments.updateClinicalDetails).not.toHaveBeenCalled();
  });

  it('targets the patient rather than the clinic in contact actions', () => {
    const patient = { ...appointment, phone: '+919876543210' };
    expect(component.whatsappUrl(patient)).toContain('https://wa.me/919876543210?text=');
    expect(component.patientPhoneHref(patient.phone)).toBe('tel:+919876543210');
    expect(component.patientPhoneLabel(patient.phone)).toBe('+919876543210');
  });

  it('explains rescheduling when no schedulable doctor exists', async () => {
    doctors.getDoctors.and.resolveTo([]);
    await component.openReschedule(appointment);
    expect(component.rescheduleLoading()).toBeFalse();
    expect(component.rescheduleError()).toContain('No schedulable doctor');
    expect(doctors.getAvailableSlots).not.toHaveBeenCalled();
  });

  it('allows clinic-level rescheduling without a fictitious doctor', async () => {
    doctors.getDoctors.and.resolveTo([]);
    const future = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    await component.openReschedule({ ...appointment, doctorId: undefined, date: future });
    expect(component.rescheduleError()).toBe('');
    expect(component.rescheduleSlots()).toContain('10:00');
    component.rescheduleTime = '10:00';
    appointments.reschedule.and.resolveTo();
    await component.saveReschedule();
    expect(appointments.reschedule).toHaveBeenCalledWith('appt', future, '10:00', null);
  });

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

  it('ignores availability from a closed dialog while another appointment loads', async () => {
    await component.openReschedule(appointment);
    let finishSlots!: (slots: string[]) => void;
    doctors.getAvailableSlots.and.returnValue(new Promise(resolve => { finishSlots = resolve; }));
    const old = component.loadRescheduleSlots();
    component.closeReschedule();
    let finishDoctors!: (value: Doctor[]) => void;
    doctors.getDoctors.and.returnValue(new Promise(resolve => { finishDoctors = resolve; }));
    const next = component.openReschedule({ ...appointment, id: 'next' });
    finishSlots(['11:00']);
    await old;
    expect(component.rescheduleSlots()).toEqual([]);
    expect(component.rescheduleLoading()).toBeTrue();
    doctors.getAvailableSlots.and.resolveTo(['14:00']);
    finishDoctors([doctor]);
    await next;
    expect(component.rescheduleSlots()).toEqual(['14:00']);
  });

  it('ignores a late doctor failure after reopening the same appointment', async () => {
    let failOld!: (error: Error) => void;
    doctors.getDoctors.and.returnValue(new Promise((_resolve, reject) => { failOld = reject; }));
    const old = component.openReschedule(appointment);
    component.closeReschedule();
    doctors.getDoctors.and.resolveTo([doctor]);
    await component.openReschedule(appointment);
    failOld(new Error('Old request failed'));
    await old;
    expect(component.rescheduleError()).toBe('');
    expect(component.rescheduleSlots()).toEqual(['10:00']);
  });
});
