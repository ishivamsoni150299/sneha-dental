import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  inject,
  signal,
  computed,
} from '@angular/core';
import {
  MarketplaceService,
  type MarketplaceAvailability,
  type MarketplaceAvailabilityDay,
  type MarketplaceAvailabilitySlot,
} from '../../../core/services/marketplace.service';

export interface SelectedSlot {
  doctorId: string;
  doctorName: string;
  date: string;
  time: string;
}

@Component({
  selector: 'app-slot-picker',
  standalone: true,
  templateUrl: './slot-picker.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SlotPickerComponent implements OnInit {
  private readonly marketplace = inject(MarketplaceService);

  @Input({ required: true }) slug!: string;
  @Output() slotSelected = new EventEmitter<SelectedSlot>();
  @Output() slotCleared = new EventEmitter<void>();

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly availability = signal<MarketplaceAvailability | null>(null);
  readonly selectedDateIndex = signal(0);
  readonly selectedSlotKey = signal<string | null>(null);

  readonly days = computed(() => this.availability()?.days ?? []);
  readonly currentDay = computed(() => this.days()[this.selectedDateIndex()] ?? null);
  readonly slots = computed(() => this.currentDay()?.slots ?? []);
  readonly hasAnySlots = computed(() => this.days().some(day => day.slots.length > 0));

  async ngOnInit(): Promise<void> {
    await this.loadAvailability();
  }

  async loadAvailability(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const data = await this.marketplace.getAvailability(this.slug, 7);
      this.availability.set(data);
      // Auto-select first day with slots
      const firstDayWithSlots = data.days.findIndex(day => day.slots.length > 0);
      if (firstDayWithSlots >= 0) this.selectedDateIndex.set(firstDayWithSlots);
    } catch {
      this.error.set('Could not load available times. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }

  selectDate(index: number): void {
    if (index === this.selectedDateIndex()) return;
    this.selectedDateIndex.set(index);
    this.selectedSlotKey.set(null);
    this.slotCleared.emit();
  }

  selectSlot(slot: MarketplaceAvailabilitySlot, day: MarketplaceAvailabilityDay): void {
    const key = `${day.date}-${slot.doctorId}-${slot.time}`;
    this.selectedSlotKey.set(key);
    this.slotSelected.emit({
      doctorId: slot.doctorId,
      doctorName: slot.doctorName,
      date: day.date,
      time: slot.time,
    });
  }

  slotKey(day: MarketplaceAvailabilityDay, slot: MarketplaceAvailabilitySlot): string {
    return `${day.date}-${slot.doctorId}-${slot.time}`;
  }

  isSelected(day: MarketplaceAvailabilityDay, slot: MarketplaceAvailabilitySlot): boolean {
    return this.selectedSlotKey() === this.slotKey(day, slot);
  }

  formatDayLabel(dateStr: string): string {
    const date = new Date(`${dateStr}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (date.getTime() === today.getTime()) return 'Today';
    if (date.getTime() === tomorrow.getTime()) return 'Tomorrow';
    return date.toLocaleDateString('en-IN', { weekday: 'short' });
  }

  formatDate(dateStr: string): string {
    return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
    });
  }

  formatTime(time: string): string {
    const [h, m] = time.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
  }
}
