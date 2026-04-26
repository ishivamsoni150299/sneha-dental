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
  time = signal('');
  service = signal('');

  ngOnInit() {
    const p = this.route.snapshot.queryParamMap;
    this.bookingRef.set(p.get('ref') ?? '');
    this.name.set(p.get('name') ?? '');
    this.date.set(p.get('date') ?? '');
    this.time.set(p.get('time') ?? '');
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
    const title    = encodeURIComponent(`Dental Appointment – ${this.clinic.config.name}`);
    const details  = encodeURIComponent(`Booking Ref: ${this.bookingRef()}\nService: ${this.service()}\nAddress: ${this.clinic.address}`);
    const location = encodeURIComponent(this.clinic.address);

    // Build a timed event (YYYYMMDDTHHMMSS) when we have a time value,
    // otherwise fall back to an all-day event so the URL is still valid.
    let dates: string;
    const timeStr = this.time(); // e.g. "09:30" or "09:30 AM"
    if (timeStr) {
      // Normalise "09:30 AM" / "9:30AM" / "09:30" → 24-h HH:MM
      const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
      if (match) {
        let h = parseInt(match[1], 10);
        const m = match[2];
        const period = (match[3] ?? '').toUpperCase();
        if (period === 'PM' && h !== 12) h += 12;
        if (period === 'AM' && h === 12) h = 0;
        const pad = (n: number) => String(n).padStart(2, '0');
        const dateBase = this.date().replace(/-/g, '');
        const startTime = `${pad(h)}${m}00`;
        const endH = h + 1 < 24 ? h + 1 : 23;
        const endTime = `${pad(endH)}${m}00`;
        dates = `${dateBase}T${startTime}/${dateBase}T${endTime}`;
      } else {
        const d = this.date().replace(/-/g, '');
        dates = `${d}/${d}`;
      }
    } else {
      const d = this.date().replace(/-/g, '');
      dates = `${d}/${d}`;
    }

    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${details}&location=${location}`;
  }

  get phoneHref(): string {
    return this.clinic.config.phoneE164 ? `tel:+${this.clinic.config.phoneE164}` : '';
  }
}
