import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ClinicConfigService } from '../../core/services/clinic-config.service';
import {
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_MAP,
  SERVICES_FAQS,
  type ServiceCategory,
} from '../../core/content/clinic-marketing.content';
import { ServiceCardComponent } from '../../shared/components/service-card/service-card.component';
import { TreatmentFinderComponent } from '../../shared/components/treatment-finder/treatment-finder.component';

@Component({
  selector: 'app-services',
  standalone: true,
  imports: [RouterLink, ServiceCardComponent, TreatmentFinderComponent],
  templateUrl: './services.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServicesComponent {
  readonly clinic = inject(ClinicConfigService);
  readonly config = this.clinic.config;

  readonly categories = SERVICE_CATEGORIES;
  readonly faqs = SERVICES_FAQS;
  readonly activeCategory = signal<ServiceCategory>('All');
  readonly openFaq = signal<number | null>(null);

  readonly filteredServices = computed(() => {
    const category = this.activeCategory();

    if (category === 'All') {
      return this.config.services;
    }

    return this.config.services.filter(
      service => (SERVICE_CATEGORY_MAP[service.name] ?? 'Preventive') === category,
    );
  });

  toggleFaq(i: number): void {
    this.openFaq.update(value => value === i ? null : i);
  }
}
