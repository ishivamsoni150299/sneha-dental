import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ClinicConfigService } from '../../core/services/clinic-config.service';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './about.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AboutComponent {
  readonly config = inject(ClinicConfigService).config;

  readonly promises = [
    { text: 'We tell you the exact cost before starting any treatment' },
    { text: 'Sterilised instruments — every patient, every time' },
    { text: 'No unnecessary procedures recommended — ever' },
    { text: 'Same-day emergency appointments available' },
    { text: 'Gentle techniques so treatment is pain-free' },
    { text: 'Full explanation before every procedure' },
  ];

  readonly values = [
    { icon: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',   title: 'Patient First',     desc: 'Every decision we make is centred around what is best for the patient.' },
    { icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',                                                                                    title: 'Honesty Always',    desc: 'We tell you exactly what you need — and what you do not.' },
    { icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z', title: 'Fair Pricing',      desc: 'Transparent costs before every procedure. No surprises on your bill.' },
    { icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',  title: 'Modern Techniques', desc: 'Continuous learning and investment in the latest dental technology.' },
  ];
}
