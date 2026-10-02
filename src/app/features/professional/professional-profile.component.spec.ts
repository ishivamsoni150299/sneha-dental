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

  it('explains invalid professional details without making a request', async () => {
    const component = TestBed.createComponent(ProfessionalProfileComponent).componentInstance;
    await component.saveProfile();
    expect(component.error()).toContain('required professional details');
    expect(api.fetch).not.toHaveBeenCalled();
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