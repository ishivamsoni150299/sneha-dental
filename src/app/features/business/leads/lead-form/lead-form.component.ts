import { Component, signal, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import {
  LeadFirestoreService, LeadStatus, LeadSource,
} from '../../../../core/services/lead-firestore.service';

@Component({
  selector: 'app-lead-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './lead-form.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LeadFormComponent implements OnInit {
  private leadStore = inject(LeadFirestoreService);
  private router    = inject(Router);
  private route     = inject(ActivatedRoute);
  private fb        = inject(FormBuilder);

  editId  = signal<string | null>(null);
  loading = signal(false);
  saving  = signal(false);
  error   = signal<string | null>(null);

  form = this.fb.nonNullable.group({
    clinicName:   ['', Validators.required],
    doctorName:   ['', Validators.required],
    phone:        ['', Validators.required],
    city:         ['', Validators.required],
    source:       ['google_maps' as LeadSource],
    status:       ['new' as LeadStatus],
    followUpDate: [''],
    referredBy:   [''],
    notes:        [''],
  });

  readonly sources: Array<{ value: LeadSource; label: string }> = [
    { value: 'google_maps', label: 'Google Maps' },
    { value: 'instagram',   label: 'Instagram / Facebook' },
    { value: 'referral',    label: 'Client Referral' },
    { value: 'ida',         label: 'IDA Association' },
    { value: 'walkin',      label: 'Walk-in / Word of Mouth' },
    { value: 'other',       label: 'Other' },
  ];

  readonly statuses: Array<{ value: LeadStatus; label: string }> = [
    { value: 'new',        label: 'New' },
    { value: 'contacted',  label: 'Contacted' },
    { value: 'interested', label: 'Interested' },
    { value: 'demo',       label: 'Demo Scheduled' },
    { value: 'converted',  label: 'Converted' },
    { value: 'lost',       label: 'Lost' },
  ];

  get isReferral() { return this.form.controls.source.value === 'referral'; }

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.editId.set(id);
    this.loading.set(true);
    try {
      const lead = await this.leadStore.getById(id);
      if (lead) {
        this.form.patchValue({
          clinicName:   lead.clinicName,
          doctorName:   lead.doctorName,
          phone:        lead.phone,
          city:         lead.city,
          source:       lead.source,
          status:       lead.status,
          followUpDate: lead.followUpDate ?? '',
          referredBy:   lead.referredBy ?? '',
          notes:        lead.notes ?? '',
        });
      }
    } finally {
      this.loading.set(false);
    }
  }

  async onSubmit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.error.set(null);
    try {
      const v = this.form.getRawValue();
      // Normalise phone to E.164
      const digits = v.phone.replace(/\D/g, '');
      const phone  = digits.startsWith('91') ? digits : `91${digits}`;
      const payload = { ...v, phone, referredBy: v.referredBy || undefined, notes: v.notes || undefined, followUpDate: v.followUpDate || undefined };

      const id = this.editId();
      if (id) {
        await this.leadStore.update(id, payload);
      } else {
        await this.leadStore.create(payload);
      }
      await this.router.navigate(['/business/leads']);
    } catch {
      this.error.set('Failed to save lead. Please try again.');
    } finally {
      this.saving.set(false);
    }
  }
}
