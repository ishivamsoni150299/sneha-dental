import { Component, ChangeDetectionStrategy, signal, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ClinicConfigService } from '../../../core/services/clinic-config.service';

interface Symptom {
  icon: string;
  label: string;
  services: string[];
  urgency: 'routine' | 'soon' | 'urgent';
}

@Component({
  selector: 'app-treatment-finder',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './treatment-finder.component.html',
})
export class TreatmentFinderComponent {
  readonly clinic   = inject(ClinicConfigService);
  /** When true: hides the title/subtitle header and removes outer padding (used on Services hero) */
  readonly compact  = input(false);

  readonly symptoms: Symptom[] = [
    { icon: 'M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z', label: 'Tooth Pain',        services: ['Root Canal', 'Tooth Fillings', 'Extraction'],           urgency: 'urgent'  },
    { icon: 'M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z', label: 'Yellow Teeth',  services: ['Teeth Whitening', 'Cleaning & Scaling'],               urgency: 'routine' },
    { icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z', label: 'Crooked Teeth', services: ['Orthodontics', 'Cosmetic Dentistry'],  urgency: 'routine' },
    { icon: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z', label: 'Bleeding Gums', services: ['Cleaning & Scaling', 'General Dentistry'], urgency: 'soon' },
    { icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', label: 'Broken Tooth',  services: ['Tooth Fillings', 'Dental Implants', 'Extraction'],          urgency: 'urgent'  },
    { icon: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z', label: 'Missing Tooth', services: ['Dental Implants', 'Cosmetic Dentistry'],               urgency: 'soon'    },
    { icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', label: 'Routine Check', services: ['General Dentistry', 'Cleaning & Scaling'],              urgency: 'routine' },
    { icon: 'M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5', label: 'Kids Dentistry', services: ['General Dentistry', 'Tooth Fillings'],                  urgency: 'routine' },
  ];

  selected = signal<Symptom | null>(null);

  select(s: Symptom) { this.selected.set(s); }
  reset() { this.selected.set(null); }

  get urgencyConfig() {
    const u = this.selected()?.urgency;
    if (u === 'urgent')  return { label: 'See us today',        classes: 'bg-red-50 text-red-700 border-red-200',    dot: 'bg-red-500'    };
    if (u === 'soon')    return { label: 'Book this week',       classes: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500' };
    return               { label: 'Flexible scheduling',        classes: 'bg-green-50 text-green-700 border-green-200',  dot: 'bg-green-500'  };
  }
}
