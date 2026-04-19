import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ServiceCardComponent } from '../../shared/components/service-card/service-card.component';
import { TestimonialCardComponent } from '../../shared/components/testimonial-card/testimonial-card.component';
import { TreatmentFinderComponent } from '../../shared/components/treatment-finder/treatment-finder.component';
import { ClinicConfigService } from '../../core/services/clinic-config.service';
import { RevealDirective } from '../../shared/directives/reveal.directive';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, ServiceCardComponent, TestimonialCardComponent, TreatmentFinderComponent, RevealDirective],
  templateUrl: './home.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  readonly clinic = inject(ClinicConfigService);
  readonly config = this.clinic.config;

  readonly trustStats = [
    { value: this.config.patientCount,        label: 'Happy Patients',    icon: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z' },
    { value: 'Modern',                        label: 'Equipment',         icon: 'M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18' },
    { value: '100%',                          label: 'Sterilized Tools',  icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
    { value: this.config.doctorQualification, label: 'Qualified Dentist', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  ];

  readonly features = [
    { icon: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z', title: 'Gentle & Pain-Free',  desc: 'Modern techniques ensure comfortable, painless treatment every visit.' },
    { icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',                                                                                   title: 'Honest Advice',      desc: 'We recommend only what you truly need — no upselling, ever.' },
    { icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z', title: 'Transparent Pricing', desc: 'Know the full cost before we start. No hidden charges, ever.' },
    { icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', title: 'Modern & Hygienic',   desc: 'Latest equipment with fully sterilized tools in a spotless clinic.' },
  ];

  readonly howItWorks = [
    { num: 1, icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4', title: 'Choose Your Service', desc: 'Browse our treatments or use the symptom finder. Pick what you need — no guesswork.' },
    { num: 2, icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',        title: 'Pick a Slot',         desc: 'Select a date and time that works for you. Same-day slots available on most days.'  },
    { num: 3, icon: 'M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',          title: 'Smile Confidently', desc: 'Arrive, get treated by an expert, and leave with a healthier smile. Zero surprises.'  },
  ];

  readonly openFaq = signal<number | null>(null);
  toggleFaq(i: number) { this.openFaq.update(v => v === i ? null : i); }

  readonly showEmergencyBanner = signal(!sessionStorage.getItem('emergency_banner_seen'));
  dismissEmergencyBanner() {
    this.showEmergencyBanner.set(false);
    sessionStorage.setItem('emergency_banner_seen', '1');
  }

  readonly faqs = [
    { q: 'Will the treatment be painful?',            a: 'We use modern anaesthesia and gentle techniques so the vast majority of treatments are completely painless. For anxious patients we take extra time to make you comfortable before we begin.' },
    { q: 'How much does a typical treatment cost?',   a: 'Costs vary by treatment — a cleaning starts around ₹500, fillings from ₹800, and root canals from ₹3,000. We always tell you the exact price before starting. No hidden charges, ever.' },
    { q: 'Do you see children?',                      a: 'Yes! We welcome patients of all ages. We have a child-friendly approach and can treat kids from age 3 onwards for check-ups, cleanings, and early orthodontic guidance.' },
    { q: 'How do I manage or cancel my booking?',     a: 'Visit the "Manage Booking" page with your booking reference and phone number. You can view your details and contact us to reschedule any time before your appointment.' },
    { q: 'Are same-day appointments available?',      a: 'Yes — we keep emergency and same-day slots open most days. Book online and mention "urgent" in the notes, or call us directly for the fastest response.' },
    { q: 'How do I know my booking went through?',    a: 'You\'ll receive a booking reference number on screen immediately. The clinic will call or WhatsApp you within 2 hours to confirm the exact time slot.' },
  ];

  get previewServices()       { return this.config.services.slice(0, 6); }
  get hasTestimonials()       { return this.config.testimonials?.length > 0; }
  get duplicatedTestimonials(){ return [...(this.config.testimonials ?? []), ...(this.config.testimonials ?? [])]; }
}
