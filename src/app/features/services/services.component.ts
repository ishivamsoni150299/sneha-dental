import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ServiceCardComponent } from '../../shared/components/service-card/service-card.component';
import { TreatmentFinderComponent } from '../../shared/components/treatment-finder/treatment-finder.component';
import { ClinicConfigService } from '../../core/services/clinic-config.service';

interface Faq { q: string; a: string }

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

  openFaq = signal<number | null>(null);
  toggleFaq(i: number) { this.openFaq.set(this.openFaq() === i ? null : i); }

  readonly faqs: Faq[] = [
    { q: 'How long does a routine check-up take?',           a: 'A standard check-up and cleaning takes 30–45 minutes. If we find something that needs attention we will explain it clearly before doing anything.' },
    { q: 'Is the treatment painful?',                        a: 'We use modern anaesthesia and gentle techniques so most procedures are completely painless. If you feel any discomfort just let us know and we will adjust.' },
    { q: 'What payment methods do you accept?',              a: 'Cash, UPI, debit/credit cards, and mobile wallets — all accepted. Annual health plans can be paid in one go or discussed with our team.' },
    { q: 'Do I need to book in advance?',                    a: 'We recommend booking online to guarantee your preferred slot. Same-day appointments are often available — call us or book in 60 seconds above.' },
    { q: 'How much does a root canal cost?',                 a: 'Root canal costs vary by tooth complexity and typically start from the range shown on the service card. The exact amount is confirmed before we begin — no surprises.' },
    { q: 'Are your tools properly sterilised?',              a: 'Yes, always. Every instrument is sterilised in an autoclave after each patient. We follow strict infection-control protocols and never reuse disposables.' },
    { q: 'Can children be treated at your clinic?',          a: 'Absolutely. We treat patients of all ages including young children. Our gentle approach and friendly team make dental visits comfortable for kids.' },
    { q: 'What if I need to cancel or reschedule?',          a: 'You can manage your appointment online using your booking reference, or call us. We just ask for at least a few hours notice so we can offer the slot to another patient.' },
  ];
}
