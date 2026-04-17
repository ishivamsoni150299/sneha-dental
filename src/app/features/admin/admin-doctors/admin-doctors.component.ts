import {
  Component, signal, ChangeDetectionStrategy, inject, OnInit, computed,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ClinicConfigService } from '../../../core/services/clinic-config.service';
import {
  DoctorService, Doctor, WEEK_DAYS, DEFAULT_SCHEDULE, WeekDay,
  formatSlotDisplay, generateSlots, type DaySchedule,
} from '../../../core/services/doctor.service';

type ModalMode = 'add' | 'edit';

function blankDoctor(): Omit<Doctor, 'id' | 'createdAt'> {
  return {
    name:          '',
    qualification: '',
    speciality:    '',
    available:     true,
    schedule:      structuredClone(DEFAULT_SCHEDULE),
  };
}

@Component({
  selector: 'app-admin-doctors',
  standalone: true,
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Toast -->
    @if (toast()) {
      <div class="fixed top-4 right-4 z-[70] flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium bg-gray-900 text-white animate-in fade-in slide-in-from-top-2 duration-200">
        <svg class="w-4 h-4 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
        </svg>
        {{ toast() }}
      </div>
    }

    <div class="min-h-screen bg-slate-50">

      <!-- ── Header ───────────────────────────────────────────────────────── -->
      <div class="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div class="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <a routerLink="/business/clinic/dashboard"
               class="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors">
              <svg class="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
              </svg>
            </a>
            <div>
              <h1 class="font-bold text-gray-900 text-lg leading-none">Doctor Management</h1>
              <p class="text-xs text-gray-400 mt-0.5">Manage doctors, schedules, and availability</p>
            </div>
          </div>
          <button (click)="openAddModal()"
                  class="flex items-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-dk)]
                         text-white font-semibold text-sm px-4 py-2.5 rounded-xl
                         transition-all shadow-sm hover:shadow-md">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
            </svg>
            Add Doctor
          </button>
        </div>
      </div>

      <div class="max-w-5xl mx-auto px-4 sm:px-6 py-8">

        <!-- ── Loading ───────────────────────────────────────────────────── -->
        @if (loading()) {
          <div class="flex items-center justify-center py-20">
            <div class="flex items-center gap-3 text-gray-400">
              <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              <span class="text-sm">Loading doctors…</span>
            </div>
          </div>
        }

        <!-- ── Error ─────────────────────────────────────────────────────── -->
        @if (errorMsg()) {
          <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 mb-6 flex items-center gap-2">
            <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            {{ errorMsg() }}
          </div>
        }

        <!-- ── Empty state ───────────────────────────────────────────────── -->
        @if (!loading() && doctors().length === 0) {
          <div class="bg-white rounded-2xl border border-gray-200 shadow-sm py-16 text-center">
            <div class="w-16 h-16 bg-[var(--accent-lt)] rounded-2xl flex items-center justify-center mx-auto mb-5">
              <svg class="w-8 h-8 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
            </div>
            <h3 class="font-bold text-gray-900 mb-2">No doctors yet</h3>
            <p class="text-sm text-gray-500 mb-6 max-w-xs mx-auto">Add your first doctor to enable doctor-specific appointment booking with live availability.</p>
            <button (click)="openAddModal()"
                    class="inline-flex items-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-dk)]
                           text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-all">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
              </svg>
              Add First Doctor
            </button>
          </div>
        }

        <!-- ── Doctor cards ──────────────────────────────────────────────── -->
        @if (!loading() && doctors().length > 0) {
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            @for (doctor of doctors(); track doctor.id) {
              <div class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">

                <!-- Card header -->
                <div class="px-5 py-4 flex items-center justify-between gap-3"
                     [class.border-b]="true"
                     [class.border-gray-100]="true">
                  <div class="flex items-center gap-3 min-w-0">
                    <!-- Avatar initials -->
                    <div class="w-11 h-11 rounded-xl bg-[var(--accent-lt)] flex items-center justify-center text-[var(--accent)] font-bold text-sm shrink-0">
                      {{ initials(doctor.name) }}
                    </div>
                    <div class="min-w-0">
                      <p class="font-bold text-gray-900 text-sm leading-none truncate">{{ doctor.name }}</p>
                      <p class="text-xs text-gray-400 mt-0.5 truncate">
                        {{ doctor.qualification }}{{ doctor.qualification && doctor.speciality ? ' · ' : '' }}{{ doctor.speciality }}
                      </p>
                    </div>
                  </div>

                  <!-- Available toggle -->
                  <button (click)="toggleAvailability(doctor)"
                          [disabled]="toggling() === doctor.id"
                          class="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all shrink-0 disabled:opacity-60"
                          [class]="doctor.available
                            ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                            : 'bg-gray-100 border-gray-200 text-gray-500 hover:bg-gray-200'">
                    <span class="w-1.5 h-1.5 rounded-full"
                          [class]="doctor.available ? 'bg-green-500' : 'bg-gray-400'"></span>
                    {{ doctor.available ? 'Available' : 'Off Today' }}
                  </button>
                </div>

                <!-- Weekly schedule summary -->
                <div class="px-5 py-3">
                  <div class="flex gap-1.5">
                    @for (day of WEEK_DAYS; track day.key) {
                      <div class="flex-1 text-center">
                        <p class="text-[10px] text-gray-400 mb-1">{{ day.label }}</p>
                        <div class="h-1.5 rounded-full"
                             [class]="doctor.schedule[day.key].enabled
                               ? 'bg-[var(--accent)]'
                               : 'bg-gray-200'"></div>
                      </div>
                    }
                  </div>
                  <p class="text-[10px] text-gray-400 mt-2">
                    Working days: {{ workingDays(doctor) }}
                  </p>
                </div>

                <!-- Actions -->
                <div class="px-5 pb-4 flex items-center gap-2">
                  <button (click)="openEditModal(doctor)"
                          class="flex-1 text-sm font-semibold text-[var(--accent)] bg-[var(--accent-lt)] hover:bg-[var(--accent-lt)]
                                 border border-[var(--accent-lt)] hover:border-[var(--accent-bd)]
                                 py-2 rounded-xl transition-all">
                    Edit Schedule
                  </button>
                  <button (click)="confirmDelete(doctor)"
                          [attr.aria-label]="'Remove ' + doctor.name"
                          class="w-9 h-9 rounded-xl bg-red-50 hover:bg-red-100 text-red-500 flex items-center justify-center transition-colors shrink-0">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                  </button>
                </div>
              </div>
            }
          </div>
        }

      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════════════════════
         ADD / EDIT DOCTOR MODAL
    ══════════════════════════════════════════════════════════════════════════ -->
    @if (showModal()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" (click)="closeModal()"></div>

        <!-- Modal panel -->
        <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

          <!-- Modal header -->
          <div class="sticky top-0 bg-white px-6 py-4 border-b border-gray-100 flex items-center justify-between z-10">
            <h2 class="font-bold text-gray-900">{{ modalMode() === 'add' ? 'Add Doctor' : 'Edit Doctor' }}</h2>
            <button (click)="closeModal()" aria-label="Close" class="w-10 h-10 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors">
              <svg class="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <div class="px-6 py-5 space-y-5">

            <!-- Name + Qualification -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-semibold text-gray-700 mb-1.5">Full Name *</label>
                <input [(ngModel)]="form.name" name="doctorName" type="text"
                       placeholder="e.g. Dr. Priya Sharma" autofocus
                       class="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[var(--accent-md)] focus:ring-2 focus:ring-blue-200 bg-white">
              </div>
              <div>
                <label class="block text-sm font-semibold text-gray-700 mb-1.5">Qualification</label>
                <input [(ngModel)]="form.qualification" name="doctorQual" type="text"
                       placeholder="e.g. BDS, MDS"
                       class="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[var(--accent-md)] focus:ring-2 focus:ring-blue-200 bg-white">
              </div>
            </div>

            <!-- Speciality + Available -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-semibold text-gray-700 mb-1.5">Speciality</label>
                <input [(ngModel)]="form.speciality" name="doctorSpec" type="text"
                       placeholder="e.g. Orthodontics"
                       class="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[var(--accent-md)] focus:ring-2 focus:ring-blue-200 bg-white">
              </div>
              <div class="flex items-center gap-3 pt-6">
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" [(ngModel)]="form.available" name="doctorAvailable" class="sr-only peer">
                  <div class="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:bg-[var(--accent)] after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:bg-white after:rounded-full after:transition-transform peer-checked:after:translate-x-5"></div>
                </label>
                <span class="text-sm font-semibold text-gray-700">Currently Available</span>
              </div>
            </div>

            <!-- Weekly Schedule -->
            <div>
              <h3 class="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                <svg class="w-4 h-4 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                </svg>
                Weekly Schedule
              </h3>
              <div class="space-y-2">
                @for (day of WEEK_DAYS; track day.key) {
                  <div class="flex items-center gap-3 py-2 px-3 rounded-xl"
                       [class]="form.schedule[day.key].enabled ? 'bg-[var(--accent-lt)]' : 'bg-gray-50'">
                    <!-- Toggle -->
                    <label class="relative inline-flex items-center cursor-pointer shrink-0">
                      <input type="checkbox"
                             [(ngModel)]="form.schedule[day.key].enabled"
                             [name]="'day-' + day.key"
                             class="sr-only peer">
                      <div class="w-8 h-4 bg-gray-300 rounded-full peer peer-checked:bg-[var(--accent)] after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-3 after:h-3 after:bg-white after:rounded-full after:transition-transform peer-checked:after:translate-x-4"></div>
                    </label>

                    <!-- Day label -->
                    <span class="w-8 text-xs font-bold text-gray-700 shrink-0">{{ day.label }}</span>

                    @if (form.schedule[day.key].enabled) {
                      <!-- Start time -->
                      <select [(ngModel)]="form.schedule[day.key].start"
                              [name]="'start-' + day.key"
                              class="flex-1 px-2 py-1.5 rounded-lg border border-[var(--accent-bd)] text-xs outline-none focus:border-[var(--accent)] bg-white cursor-pointer">
                        @for (t of TIME_OPTIONS; track t) {
                          <option [value]="t">{{ formatSlotDisplay(t) }}</option>
                        }
                      </select>
                      <span class="text-xs text-gray-400 shrink-0">to</span>
                      <!-- End time -->
                      <select [(ngModel)]="form.schedule[day.key].end"
                              [name]="'end-' + day.key"
                              class="flex-1 px-2 py-1.5 rounded-lg border border-[var(--accent-bd)] text-xs outline-none focus:border-[var(--accent)] bg-white cursor-pointer">
                        @for (t of TIME_OPTIONS; track t) {
                          <option [value]="t">{{ formatSlotDisplay(t) }}</option>
                        }
                      </select>
                      <!-- Slot preview -->
                      <span class="text-[10px] text-[var(--accent)] font-semibold whitespace-nowrap shrink-0">
                        {{ slotsCount(form.schedule[day.key]) }} slots
                      </span>
                    } @else {
                      <span class="flex-1 text-xs text-gray-400 italic">Day off</span>
                    }
                  </div>
                }
              </div>
            </div>

          </div>

          <!-- Modal footer -->
          <div class="sticky bottom-0 bg-white px-6 py-4 border-t border-gray-100 flex gap-3">
            <button (click)="closeModal()"
                    class="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold py-2.5 rounded-xl text-sm transition-colors">
              Cancel
            </button>
            <button (click)="saveDoctor()"
                    [disabled]="saving() || !form.name.trim()"
                    class="flex-1 bg-[var(--accent)] hover:bg-[var(--accent-dk)] text-white font-bold py-2.5 rounded-xl text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed">
              @if (saving()) {
                <span class="flex items-center justify-center gap-2">
                  <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Saving…
                </span>
              } @else {
                {{ modalMode() === 'add' ? 'Add Doctor' : 'Save Changes' }}
              }
            </button>
          </div>
        </div>
      </div>
    }

    <!-- ── Delete confirmation modal ──────────────────────────────────────── -->
    @if (deleteTarget()) {
      <div class="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" (click)="deleteTarget.set(null)"></div>
        <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-in fade-in zoom-in-95 duration-200">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center shrink-0">
              <svg class="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </div>
            <div>
              <h3 class="font-bold text-gray-900 text-sm">Remove doctor</h3>
              <p class="text-xs text-gray-400">{{ deleteTarget()?.name }}</p>
            </div>
          </div>
          <p class="text-sm text-gray-600 mb-5">This will permanently remove the doctor. Existing appointments will not be affected.</p>
          <div class="flex gap-3">
            <button (click)="deleteTarget.set(null)"
                    class="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold py-2.5 rounded-xl text-sm transition-colors">
              Keep
            </button>
            <button (click)="doDelete()"
                    [disabled]="saving()"
                    class="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-2.5 rounded-xl text-sm transition-colors">
              Remove
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class AdminDoctorsComponent implements OnInit {
  private readonly clinic    = inject(ClinicConfigService);
  private readonly doctorSvc = inject(DoctorService);

  readonly WEEK_DAYS      = WEEK_DAYS;
  readonly formatSlotDisplay = formatSlotDisplay;

  // ── Lazy-generated list of time options (every 30 min, 6 AM – 10 PM)
  readonly TIME_OPTIONS: string[] = (() => {
    const opts: string[] = [];
    for (let m = 360; m <= 1320; m += 30) {
      const h = Math.floor(m / 60);
      const min = m % 60;
      opts.push(`${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
    }
    return opts;
  })();

  // ── State ─────────────────────────────────────────────────────────────────
  doctors     = signal<Doctor[]>([]);
  loading     = signal(true);
  errorMsg    = signal<string | null>(null);
  saving      = signal(false);
  toggling    = signal<string | null>(null);
  deleteTarget = signal<Doctor | null>(null);
  toast       = signal<string | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  private showToast(msg: string) {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast.set(msg);
    this.toastTimer = setTimeout(() => this.toast.set(null), 3000);
  }

  // ── Modal ─────────────────────────────────────────────────────────────────
  showModal  = signal(false);
  modalMode  = signal<ModalMode>('add');
  editId     = signal<string | null>(null);
  form: Omit<Doctor, 'id' | 'createdAt'> = blankDoctor();

  private get clinicId(): string { return this.clinic.config.clinicId ?? ''; }

  ngOnInit() { void this.loadDoctors(); }

  async loadDoctors() {
    if (!this.clinicId) { this.loading.set(false); return; }
    try {
      const docs = await this.doctorSvc.getDoctors(this.clinicId);
      this.doctors.set(docs);
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code ?? 'unknown';
      console.error('[AdminDoctors] getDoctors failed:', e);
      this.errorMsg.set(`Could not load doctors (${code}). Please refresh.`);
    } finally {
      this.loading.set(false);
    }
  }

  openAddModal() {
    this.form = blankDoctor();
    this.editId.set(null);
    this.modalMode.set('add');
    this.showModal.set(true);
  }

  openEditModal(doctor: Doctor) {
    this.form = {
      name:          doctor.name,
      qualification: doctor.qualification,
      speciality:    doctor.speciality,
      available:     doctor.available,
      schedule:      structuredClone(doctor.schedule),
    };
    this.editId.set(doctor.id ?? null);
    this.modalMode.set('edit');
    this.showModal.set(true);
  }

  closeModal() { this.showModal.set(false); }

  async saveDoctor() {
    if (!this.form.name.trim() || !this.clinicId) return;
    this.saving.set(true);
    this.errorMsg.set(null);
    try {
      if (this.modalMode() === 'add') {
        const newId = await this.doctorSvc.addDoctor(this.clinicId, this.form);
        this.doctors.update(list => [...list, { id: newId, ...this.form }]);
        this.showToast(`Dr. ${this.form.name} added.`);
      } else {
        const id = this.editId()!;
        await this.doctorSvc.updateDoctor(this.clinicId, id, this.form);
        this.doctors.update(list =>
          list.map(d => d.id === id ? { ...d, ...this.form } : d)
        );
        this.showToast('Doctor updated.');
      }
      this.closeModal();
    } catch (e) {
      console.error(e);
      this.errorMsg.set('Save failed. Please try again.');
    } finally {
      this.saving.set(false);
    }
  }

  async toggleAvailability(doctor: Doctor) {
    if (!doctor.id || !this.clinicId) return;
    this.toggling.set(doctor.id);
    try {
      const next = !doctor.available;
      await this.doctorSvc.updateDoctor(this.clinicId, doctor.id, { available: next });
      this.doctors.update(list =>
        list.map(d => d.id === doctor.id ? { ...d, available: next } : d)
      );
    } catch (e) {
      console.error(e);
      this.errorMsg.set('Update failed.');
    } finally {
      this.toggling.set(null);
    }
  }

  confirmDelete(doctor: Doctor) { this.deleteTarget.set(doctor); }

  async doDelete() {
    const target = this.deleteTarget();
    if (!target?.id || !this.clinicId) return;
    this.saving.set(true);
    try {
      await this.doctorSvc.deleteDoctor(this.clinicId, target.id);
      this.doctors.update(list => list.filter(d => d.id !== target.id));
      this.deleteTarget.set(null);
      this.showToast(`${target.name} removed.`);
    } catch (e) {
      console.error(e);
      this.errorMsg.set('Delete failed.');
    } finally {
      this.saving.set(false);
    }
  }

  initials(name: string): string {
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  workingDays(doctor: Doctor): string {
    return WEEK_DAYS
      .filter(d => doctor.schedule[d.key].enabled)
      .map(d => d.label)
      .join(', ') || 'None';
  }

  slotsCount(day: DaySchedule): number {
    return generateSlots(day.start, day.end).length;
  }
}
