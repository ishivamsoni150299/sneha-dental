import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ClinicConfigService } from '../../core/services/clinic-config.service';
import { DOCUMENT } from '@angular/common';
import { isPlatformHomeHost } from '../../core/guards/platform-home.guard';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './not-found.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundComponent {
  readonly clinic = inject(ClinicConfigService);
  private readonly document = inject(DOCUMENT);
  readonly platformPage = isPlatformHomeHost(this.document.location?.hostname ?? '') || !this.clinic.isLoaded;

  get phoneHref(): string {
    return this.clinic.config.phoneE164 ? `tel:+${this.clinic.config.phoneE164}` : '';
  }
}
