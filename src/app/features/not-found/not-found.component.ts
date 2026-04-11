import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ClinicConfigService } from '../../core/services/clinic-config.service';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './not-found.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundComponent {
  readonly clinic = inject(ClinicConfigService);

  get phoneHref(): string {
    return this.clinic.config.phoneE164 ? `tel:+${this.clinic.config.phoneE164}` : '';
  }
}
