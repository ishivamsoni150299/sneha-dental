import {
  Component, ChangeDetectionStrategy, inject, signal, computed, OnInit, OnDestroy,
} from '@angular/core';
import { ClinicConfigService } from '../../core/services/clinic-config.service';

interface TimeLeft { days: number; hours: number; minutes: number; seconds: number }

@Component({
  selector: 'app-coming-soon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './coming-soon.component.html',
})
export class ComingSoonComponent implements OnInit, OnDestroy {
  readonly clinic = inject(ClinicConfigService);
  readonly config = this.clinic.config;

  private intervalId: ReturnType<typeof setInterval> | null = null;
  readonly timeLeft = signal<TimeLeft | null>(null);
  readonly hasCountdown = computed(() => !!this.config.launchDate);

  readonly whatsappNotifyUrl = computed(() =>
    this.clinic.whatsappUrl(
      `Hi! I'd like to be notified when ${this.config.name || 'your clinic'} launches. Please add me to your list.`
    )
  );

  readonly callUrl = computed(() => `tel:+${this.config.phoneE164}`);

  ngOnInit(): void {
    if (this.config.launchDate) {
      this.tick();
      this.intervalId = setInterval(() => this.tick(), 1000);
    }
  }

  ngOnDestroy(): void {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  private tick(): void {
    const target = new Date(this.config.launchDate!).getTime();
    const now    = Date.now();
    const diff   = target - now;

    if (diff <= 0) {
      this.timeLeft.set({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      if (this.intervalId) clearInterval(this.intervalId);
      return;
    }

    this.timeLeft.set({
      days:    Math.floor(diff / 86_400_000),
      hours:   Math.floor((diff % 86_400_000) / 3_600_000),
      minutes: Math.floor((diff % 3_600_000)  / 60_000),
      seconds: Math.floor((diff % 60_000)     / 1_000),
    });
  }

  pad(n: number): string { return String(n).padStart(2, '0'); }
}
