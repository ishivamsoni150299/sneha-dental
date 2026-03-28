import { Component, signal, computed, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { AppointmentService, Appointment } from '../../../core/services/appointment.service';
import { ClinicConfigService } from '../../../core/services/clinic-config.service';

type FilterTab = 'all' | 'pending' | 'confirmed' | 'today';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [],
  templateUrl: './admin-dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDashboardComponent implements OnInit {
  private auth               = inject(AuthService);
  private appointmentService = inject(AppointmentService);
  private router             = inject(Router);
  readonly clinic            = inject(ClinicConfigService);
  readonly clinicConfig      = this.clinic.config;

  appointments = signal<Appointment[]>([]);
  loading      = signal(true);
  activeTab    = signal<FilterTab>('all');
  actionError  = signal<string | null>(null);
  updatingId   = signal<string | null>(null);

  today = new Date().toISOString().split('T')[0];

  adminEmail = computed(() => this.auth.currentUser()?.email ?? '');

  filteredAppointments = computed(() => {
    const all = this.appointments();
    const tab = this.activeTab();
    if (tab === 'today')     return all.filter(a => a.date === this.today);
    if (tab === 'pending')   return all.filter(a => a.status === 'pending');
    if (tab === 'confirmed') return all.filter(a => a.status === 'confirmed');
    return all;
  });

  counts = computed(() => ({
    all:       this.appointments().length,
    today:     this.appointments().filter(a => a.date === this.today).length,
    pending:   this.appointments().filter(a => a.status === 'pending').length,
    confirmed: this.appointments().filter(a => a.status === 'confirmed').length,
  }));

  async ngOnInit() {
    await this.loadAppointments();
  }

  async loadAppointments() {
    this.loading.set(true);
    try {
      const list = await this.appointmentService.getAllAppointments();
      this.appointments.set(list);
    } catch {
      this.actionError.set('Failed to load appointments.');
    } finally {
      this.loading.set(false);
    }
  }

  async confirm(appt: Appointment) {
    this.updatingId.set(appt.id!);
    this.actionError.set(null);
    try {
      await this.appointmentService.setStatus(appt.id!, 'confirmed');
      this.appointments.update(list =>
        list.map(a => a.id === appt.id ? { ...a, status: 'confirmed' } : a)
      );
    } catch {
      this.actionError.set('Could not confirm appointment.');
    } finally {
      this.updatingId.set(null);
    }
  }

  async cancel(appt: Appointment) {
    if (!confirm(`Cancel appointment for ${appt.name} on ${appt.date}?`)) return;
    this.updatingId.set(appt.id!);
    this.actionError.set(null);
    try {
      await this.appointmentService.setStatus(appt.id!, 'cancelled');
      this.appointments.update(list =>
        list.map(a => a.id === appt.id ? { ...a, status: 'cancelled' } : a)
      );
    } catch {
      this.actionError.set('Could not cancel appointment.');
    } finally {
      this.updatingId.set(null);
    }
  }

  async logout() {
    await this.auth.logout();
    this.router.navigate(['/admin/login']);
  }

  formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  whatsappUrl(appt: Appointment): string {
    const msg = `Hi ${appt.name}! Your appointment at ${this.clinicConfig.name} is confirmed for ${this.formatDate(appt.date)} (${appt.time}). Your Booking Ref: ${appt.bookingRef}. Address: ${this.clinic.address}. See you soon! — ${this.clinicConfig.doctorName}`;
    return this.clinic.whatsappUrl(msg);
  }

  statusColor(status: string): string {
    if (status === 'confirmed')  return 'bg-green-100 text-green-700';
    if (status === 'cancelled')  return 'bg-red-100 text-red-600';
    return 'bg-yellow-100 text-yellow-700';
  }
}
