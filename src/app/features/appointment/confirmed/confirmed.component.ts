import { Component, OnInit, signal, ChangeDetectionStrategy, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ClinicConfigService } from '../../../core/services/clinic-config.service';

@Component({
  selector: 'app-confirmed',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './confirmed.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmedComponent implements OnInit {
  private route = inject(ActivatedRoute);
  readonly clinic = inject(ClinicConfigService);

  bookingRef = signal('');
  name = signal('');
  date = signal('');
  service = signal('');

  ngOnInit() {
    const p = this.route.snapshot.queryParamMap;
    this.bookingRef.set(p.get('ref') ?? '');
    this.name.set(p.get('name') ?? '');
    this.date.set(p.get('date') ?? '');
    this.service.set(p.get('service') ?? '');
  }

  get formattedDate(): string {
    if (!this.date()) return '';
    const d = new Date(this.date() + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  get whatsappUrl(): string {
    const msg = `Hi ${this.clinic.config.name}! I just booked an appointment.\nName: ${this.name()}\nBooking Ref: ${this.bookingRef()}\nDate: ${this.formattedDate}\nService: ${this.service()}\n\nPlease confirm my slot. Thank you!`;
    return this.clinic.whatsappUrl(msg);
  }

  get calendarUrl(): string {
    if (!this.date()) return '';
    const d = this.date().replace(/-/g, '');
    const title = encodeURIComponent(`Dental Appointment - ${this.clinic.config.name}`);
    const details = encodeURIComponent(`Booking Ref: ${this.bookingRef()}\nService: ${this.service()}\nAddress: ${this.clinic.address}`);
    const location = encodeURIComponent(this.clinic.address);
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${d}/${d}&details=${details}&location=${location}`;
  }

  get phoneHref(): string {
    return this.clinic.config.phoneE164 ? `tel:+${this.clinic.config.phoneE164}` : '';
  }
}
