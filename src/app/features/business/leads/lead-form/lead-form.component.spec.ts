import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { LeadApiService } from '../../../../core/services/lead-api.service';
import { LeadFormComponent } from './lead-form.component';

describe('Lead phone validation', () => {
  let store: jasmine.SpyObj<LeadApiService>;
  let component: LeadFormComponent;
  beforeEach(() => {
    store = jasmine.createSpyObj('LeadApiService', ['create', 'update']);
    store.create.and.resolveTo('lead');
    TestBed.configureTestingModule({ providers: [
      { provide: LeadApiService, useValue: store },
      { provide: Router, useValue: { navigate: () => Promise.resolve(true) } },
      { provide: ActivatedRoute, useValue: {} },
    ] });
    component = TestBed.runInInjectionContext(() => new LeadFormComponent());
    component.form.patchValue({ clinicName: 'QA Clinic', city: 'Noida' });
  });

  it('rejects a five-digit phone without saving', async () => {
    component.form.controls.phone.setValue('12345');
    await component.onSubmit();
    expect(component.form.controls.phone.invalid).toBeTrue();
    expect(component.form.controls.phone.touched).toBeTrue();
    expect(store.create).not.toHaveBeenCalled();
  });

  it('preserves an explicit international number on save', async () => {
    component.form.controls.phone.setValue('+1 (202) 555-0123');
    await component.onSubmit();
    expect(store.create.calls.mostRecent().args[0].phone).toBe('12025550123');
  });
});