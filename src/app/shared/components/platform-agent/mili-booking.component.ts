import { Component, DestroyRef, Input, OnChanges, OnInit, SimpleChanges, Output, EventEmitter, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MarketplaceBookingComponent } from '../../../features/marketplace/marketplace-booking.component';
import { BookingSubmission } from '../../../features/appointment/appointment.component';
import { formatDateInTimeZone } from '../../../core/utils/date-input';

export interface BookingCriteria { query: string; locality: string; date: string; period: 'any' | 'morning' | 'afternoon' | 'evening' }
interface DentistChoice { id: string; slug: string; clinicName: string; dentistName: string; city: string; locality: string; consultationFee: number | null; acceptingNewPatients: boolean }

@Component({
  selector: 'app-mili-booking', standalone: true, imports: [FormsModule, MarketplaceBookingComponent],
  templateUrl: './mili-booking.component.html', styleUrl: './mili-booking.component.css',
})
export class MiliBookingComponent implements OnChanges, OnInit {
  readonly today = formatDateInTimeZone();
  readonly lastDate = formatDateInTimeZone(new Date(Date.now() + 90 * 86400000));
  @Input() criteria: BookingCriteria = { query: '', locality: '', date: '', period: 'any' };
  @Input() updating = false;
  @Output() readonly finished = new EventEmitter<void>();
  @Output() readonly sent = new EventEmitter<BookingSubmission>();
  @ViewChild(MarketplaceBookingComponent) checkout?: MarketplaceBookingComponent;
  readonly selected = signal<DentistChoice | null>(null);
  readonly choices = signal<DentistChoice[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly total = signal(0);
  readonly offset = signal(0);
  readonly receipt = signal<BookingSubmission | null>(null);
  readonly editingSearch = signal(false);
  readonly steps = ['Dentist', 'Time', 'Details', 'Sent'];
  dateLabel(): string {
    if (!this.applied.date) return 'Next 7 days';
    const date = new Date(`${this.applied.date}T12:00:00+05:30`);
    return Number.isNaN(date.getTime()) ? this.applied.date : new Intl.DateTimeFormat('en-IN', {
      weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata',
    }).format(date);
  }
  step(): number {
    if (this.receipt()) return 3;
    if (!this.selected()) return 0;
    return this.checkout?.selectedSlot() && !this.checkout.editingTime() ? 2 : 1;
  }
  changeTime(): boolean {
    if (!this.checkout || this.checkout.submitting() || this.receipt() || !this.checkout.selectedSlot()) return false;
    this.checkout.setEditingTime(true);
    return true;
  }
  search: BookingCriteria = { query: '', locality: '', date: '', period: 'any' };
  applied: BookingCriteria = { ...this.search };
  private request = 0;
  private pendingCriteria = false;
  private readonly abort = new AbortController();
  constructor() { inject(DestroyRef).onDestroy(() => { this.request++; this.abort.abort(); }); }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (changes['criteria']) this.pendingCriteria = true;
    if (this.pendingCriteria && !this.updating && !this.selected()) {
      this.pendingCriteria = false;
      this.search = { ...this.criteria };
      this.editingSearch.set(!this.search.locality && !this.search.query && !this.search.date && this.search.period === 'any');
      await this.find();
    }
  }
  async ngOnInit(): Promise<void> { if (!this.request && !this.updating) await this.find(); }

  async find(offset = 0): Promise<void> {
    if (this.checkout?.submitting() || this.updating) return;
    const request = ++this.request;
    this.selected.set(null); this.loading.set(true); this.error.set(''); this.receipt.set(null);
    this.applied = { ...this.search }; this.offset.set(offset);
    const params = new URLSearchParams({ query: this.search.query.trim(), locality: this.search.locality.trim(), acceptingNewPatients: 'true', limit: '6', offset: String(offset) });
    try {
      const response = await fetch(`/api/v1/dentists?${params}`, { signal: this.abort.signal });
      if (!response.ok) throw new Error('Dentists could not be loaded. Please try again.');
      const result = await response.json() as { dentists: DentistChoice[]; totalCount: number };
      if (request !== this.request) return;
      this.choices.set(result.dentists.filter(item => item.acceptingNewPatients && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug)));
      this.total.set(result.totalCount);
    } catch (error) { if (request === this.request) this.error.set(error instanceof Error ? error.message : 'Search is unavailable.'); }
    finally { if (request === this.request) this.loading.set(false); }
  }

  select(choice: DentistChoice): void { if (!this.updating) this.selected.set(choice); }
  back(): void { if (!this.checkout?.submitting()) { this.selected.set(null); this.receipt.set(null); } }
  complete(receipt: BookingSubmission): void { this.receipt.set(receipt); this.sent.emit(receipt); }
  close(): void { if (!this.checkout?.submitting() && !this.updating) this.finished.emit(); }
}
