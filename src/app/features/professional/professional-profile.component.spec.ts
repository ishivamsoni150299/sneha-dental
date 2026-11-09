import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthenticatedApiService } from '../../core/services/authenticated-api.service';
import { ProfessionalProfileComponent } from './professional-profile.component';

describe('Professional profile feedback', () => {
  let api: jasmine.SpyObj<AuthenticatedApiService>;

  beforeEach(() => {
    api = jasmine.createSpyObj('AuthenticatedApiService', ['fetch']);
    TestBed.configureTestingModule({ imports: [ProfessionalProfileComponent], providers: [
      { provide: AuthenticatedApiService, useValue: api },
      { provide: Router, useValue: { navigateByUrl: () => Promise.resolve(true) } },
    ] });
  });

  it('offers a retry instead of blank editable details when the profile fails to load', async () => {
    api.fetch.and.resolveTo(new Response('{}', { status: 503 }));
    const fixture = TestBed.createComponent(ProfessionalProfileComponent);
    fixture.componentRef.setInput('embedded', true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Retry profile');
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Could not load profile');
  });

  it('submits verification once while pending and restores the action after failure', async () => {
    const fixture = TestBed.createComponent(ProfessionalProfileComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('hasHours', true);
    component.loading.set(false);
    component.profile.set({ fullName: 'Dr Test', qualification: 'BDS', speciality: 'General dentistry', biography: '', experienceYears: 5, registrationNumber: 'TEST123', registrationCouncil: 'Test council', phoneE164: null, photoUrl: null, languages: [], verificationStatus: 'draft', locations: [{ id: 'practice', name: 'Practice', city: 'Noida', status: 'active' }] });
    let finish!: (response: Response) => void;
    api.fetch.and.returnValue(new Promise(resolve => { finish = resolve; }));
    const pending = component.submitVerification();
    expect(component.saving()).toBeTrue();
    expect(component.canSubmitVerification()).toBeFalse();
    await component.submitVerification();
    expect(api.fetch).toHaveBeenCalledTimes(1);
    finish(new Response('{"message":"Please try again"}', { status: 503 }));
    await pending;
    expect(component.saving()).toBeFalse();
    expect(component.canSubmitVerification()).toBeTrue();
    expect(component.error()).toBe('Please try again');
  });

  it('explains invalid professional details without making a request', async () => {
    const component = TestBed.createComponent(ProfessionalProfileComponent).componentInstance;
    await component.saveProfile();
    expect(component.error()).toContain('required professional details');
    expect(api.fetch).not.toHaveBeenCalled();
  });
  it('rejects unsupported photo files without sending them', async () => {
    const component = TestBed.createComponent(ProfessionalProfileComponent).componentInstance;
    await component.uploadPhoto({ target: { files: [new File(['svg'], 'photo.svg', { type: 'image/svg+xml' })], value: '' } } as unknown as Event);
    expect(component.error()).toContain('JPG or PNG');
    expect(api.fetch).not.toHaveBeenCalled();
  });
  it('shows an upload failure and allows another attempt', async () => {
    const component = TestBed.createComponent(ProfessionalProfileComponent).componentInstance;
    api.fetch.and.resolveTo(new Response('{"message":"Photo unavailable"}', { status: 503 }));
    await component.uploadPhoto({ target: { files: [new File(['png'], 'photo.png', { type: 'image/png' })], value: '' } } as unknown as Event);
    expect(component.error()).toContain('Photo unavailable');
    expect(component.saving()).toBeFalse();
  });

  it('explains invalid practice fees without making a request', async () => {
    const component = TestBed.createComponent(ProfessionalProfileComponent).componentInstance;
    component.locationForm.setValue({ name: 'Practice', addressLine1: 'Address', locality: '', city: 'Noida', consultationFee: -1 });
    await component.addLocation();
    expect(component.error()).toContain('zero or more');
    expect(api.fetch).not.toHaveBeenCalled();
  });

  it('does not reload or emit from a destroyed practice editor', async () => {
    const fixture = TestBed.createComponent(ProfessionalProfileComponent);
    const component = fixture.componentInstance;
    component.locationForm.setValue({ name: 'Practice', addressLine1: 'Address', locality: '', city: 'Noida', consultationFee: 0 });
    let finish!: (response: Response) => void;
    api.fetch.and.returnValue(new Promise(resolve => { finish = resolve; }));
    const reload = spyOn(component, 'load');
    const saving = component.addLocation();
    expect(component.savingLocation()).toBeTrue();
    await component.addLocation();
    expect(api.fetch).toHaveBeenCalledTimes(1);
    fixture.destroy();
    finish(new Response('{}', { status: 201 }));
    await saving;
    expect(reload).not.toHaveBeenCalled();
    expect(component.savingLocation()).toBeFalse();
  });
});
