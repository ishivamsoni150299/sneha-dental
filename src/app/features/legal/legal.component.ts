import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ClinicConfigService } from '../../core/services/clinic-config.service';

@Component({
  selector: 'app-legal',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './legal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LegalComponent {
  readonly clinic = inject(ClinicConfigService);
  private readonly route = inject(ActivatedRoute);
  readonly page = this.route.snapshot.data['legalPage'] as 'privacy' | 'terms';
  readonly effectiveDate = '29 August 2026';
}
