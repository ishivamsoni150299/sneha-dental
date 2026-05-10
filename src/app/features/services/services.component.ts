import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ClinicService, HealthPlan } from '../../core/config/clinic.config';
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
  imports: [NgClass, RouterLink, ServiceCardComponent, TreatmentFinderComponent],
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

  readonly filteredServices = computed<ClinicService[]>(() => {
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

  categoryButtonClass(category: ServiceCategory): string {
    return this.activeCategory() === category
      ? 'bg-[var(--accent)] text-white shadow-sm'
      : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200';
  }

  planCardClass(plan: HealthPlan): string {
    return plan.highlighted
      ? 'border-[var(--accent)] shadow-md shadow-[var(--accent-sh)]'
      : 'border-gray-200 shadow-sm';
  }

  planHeaderClass(plan: HealthPlan): string {
    return plan.highlighted ? 'bg-[var(--accent)]' : 'bg-white';
  }

  planTagClass(plan: HealthPlan): string {
    return plan.highlighted
      ? 'bg-white/20 text-white'
      : 'bg-[var(--accent-lt)] text-[var(--accent-dk)]';
  }

  planTitleClass(plan: HealthPlan): string {
    return plan.highlighted ? 'text-white' : 'text-gray-900';
  }

  planSubtextClass(plan: HealthPlan): string {
    return plan.highlighted ? 'text-white/80' : 'text-gray-500';
  }

  planPriceClass(plan: HealthPlan): string {
    return plan.highlighted ? 'text-white' : 'text-[var(--accent)]';
  }

  planPeriodClass(plan: HealthPlan): string {
    return plan.highlighted ? 'text-white/70' : 'text-gray-400';
  }

  planButtonClass(plan: HealthPlan): string {
    return plan.highlighted
      ? 'bg-[var(--accent)] hover:bg-[var(--accent-dk)] text-white'
      : 'border-2 border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent-lt)]';
  }

  faqPanelClass(index: number): string {
    return this.openFaq() === index ? 'border-[var(--accent-bd)] shadow-sm' : 'border-gray-100';
  }

  faqButtonClass(index: number): string {
    return this.openFaq() === index ? 'bg-[var(--accent-lt)]' : 'bg-white hover:bg-gray-50';
  }

  faqIconClass(index: number): string {
    return this.openFaq() === index ? 'bg-[var(--accent)] rotate-45' : 'bg-gray-100';
  }

  faqIconColorClass(index: number): string {
    return this.openFaq() === index ? 'text-white' : 'text-gray-500';
  }
}
