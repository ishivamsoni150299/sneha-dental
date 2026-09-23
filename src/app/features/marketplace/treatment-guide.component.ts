import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

export interface TreatmentCostGuideItem {
  treatment: string;
  serviceId: string;
  specialty: string;
  priceRange: string;
  sittings: string;
  overview: string;
}

@Component({
  selector: 'app-treatment-guide',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="cost-guide-section mt-16 border-t border-gray-200 pt-10" aria-labelledby="cost-guide-heading">
      <div class="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div class="max-w-2xl">
          <p class="text-xs font-semibold uppercase tracking-widest text-blue-700">Plan your visit</p>
          <h2 id="cost-guide-heading" class="mt-3 scroll-mt-32 text-3xl font-semibold leading-tight text-gray-900 sm:text-4xl">Understand your care.<br> Plan your budget.</h2>
          <p class="mt-4 text-sm leading-6 text-gray-500">Explore dental treatments and indicative cost ranges for Delhi NCR. These are estimates, not clinic quotes.</p>
        </div>
        <span class="flex items-center gap-2 text-xs text-gray-500"><i class="ph ph-info text-lg" aria-hidden="true"></i> Final fees confirmed by your dentist</span>
      </div>
      <div id="treatment-options" class="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        @for (item of visibleItems(); track item.treatment) {
          <article class="flex flex-col rounded-2xl border border-gray-200 bg-white p-5">
            <h3 class="min-h-12 text-base font-semibold leading-6 text-gray-900">{{ item.treatment }}</h3>
            <p class="mt-4 text-xl font-semibold tracking-tight text-blue-700">{{ item.priceRange }}</p>
            <p class="mt-1 flex items-center gap-2 text-xs text-gray-500"><i class="ph ph-clock" aria-hidden="true"></i>{{ item.sittings }}</p>
            <button type="button" class="mt-5 flex min-h-11 items-center justify-between rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 focus-visible:outline-blue-600"
              [attr.aria-label]="'View dentists for ' + item.treatment" (click)="serviceSelected.emit(item.serviceId)">View dentists<i class="ph ph-arrow-right" aria-hidden="true"></i></button>
          </article>
        }
      </div>
      @if (items().length > 4) {
        <button type="button" class="mx-auto mt-6 flex min-h-12 items-center gap-2 rounded-xl border border-gray-200 bg-white px-5 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus-visible:outline-blue-600"
          (click)="expanded.set(!expanded())" [attr.aria-expanded]="expanded()" aria-controls="treatment-options">{{ expanded() ? 'Show fewer treatments' : 'Explore all ' + items().length + ' treatments' }}<i [class]="expanded() ? 'ph ph-caret-up' : 'ph ph-caret-down'" aria-hidden="true"></i></button>
      }
      <p class="mt-5 text-xs leading-5 text-gray-500">Costs and visit counts vary with materials and clinical needs. Your dentist will confirm your treatment plan and fee after a consultation.</p>
    </section>
  `,
})
export class TreatmentGuideComponent {
  readonly items = input.required<TreatmentCostGuideItem[]>();
  readonly serviceSelected = output<string>();
  readonly expanded = signal(false);
  visibleItems(): TreatmentCostGuideItem[] {
    return this.expanded() ? this.items() : this.items().slice(0, 4);
  }
}
