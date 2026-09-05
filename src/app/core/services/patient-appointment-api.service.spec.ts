import { TestBed } from '@angular/core/testing';
import { PatientAppointmentApiService } from './patient-appointment-api.service';
import { PatientAuthService } from './patient-auth.service';

describe('PatientAppointmentApiService', () => {
  const patientAuth = {
    user: () => ({ phoneNumber: '+919876543210' }),
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [{ provide: PatientAuthService, useValue: patientAuth }] });
  });

  it('claims a booking through the public Spring lookup', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').and.resolveTo(jsonResponse({
      id: 'appointment-1', bookingRef: 'SC-ABCDEFGH', clinicId: 'clinic-1', status: 'pending',
    }));
    const service = TestBed.inject(PatientAppointmentApiService);

    await service.claim('SC-ABCDEFGH');

    expect(fetchSpy).toHaveBeenCalledWith('/api/public/appointments/lookup-any', jasmine.objectContaining({
      method: 'POST',
      body: JSON.stringify({ bookingRef: 'SC-ABCDEFGH', phone: '+919876543210' }),
    }));
  });

  it('sends the matching phone when cancelling', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').and.returnValues(
      Promise.resolve(jsonResponse({
        id: 'appointment-1', bookingRef: 'SC-ABCDEFGH', clinicId: 'clinic-1', status: 'pending',
      })),
      Promise.resolve(new Response(null, { status: 204 })),
    );
    const service = TestBed.inject(PatientAppointmentApiService);
    await service.claim('SC-ABCDEFGH');

    await expectAsync(service.cancel('appointment-1')).toBeResolved();
    expect(fetchSpy).toHaveBeenCalledWith('/api/public/appointments/appointment-1/cancel', jasmine.objectContaining({
      body: JSON.stringify({ phone: '+919876543210' }),
    }));
  });

  it('submits a review with phone ownership proof', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').and.resolveTo(jsonResponse({ id: 'review-1', rating: 5 }));
    const service = TestBed.inject(PatientAppointmentApiService);

    await service.submitReview('appointment-1', 5, 'Kind and clear care.', true);

    expect(fetchSpy).toHaveBeenCalledWith('/api/public/appointments/appointment-1/review', jasmine.objectContaining({
      body: JSON.stringify({
        phone: '+919876543210', rating: 5, text: 'Kind and clear care.', anonymous: true,
      }),
    }));
  });
});

function jsonResponse(body: object): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
