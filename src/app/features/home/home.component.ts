import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ServiceCardComponent } from '../../shared/components/service-card/service-card.component';
import { TestimonialCardComponent } from '../../shared/components/testimonial-card/testimonial-card.component';
import { ClinicConfigService } from '../../core/services/clinic-config.service';
import type { ClinicFaq, ClinicHomeCustomization, ClinicImage } from '../../core/config/clinic.config';
import { RevealDirective } from '../../shared/directives/reveal.directive';
import {
  buildClinicMonogram,
  buildDoctorLabel,
} from '../../core/utils/clinic-branding';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, ServiceCardComponent, TestimonialCardComponent, RevealDirective],
  templateUrl: './home.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  readonly clinic = inject(ClinicConfigService);
  readonly config = this.clinic.config;
  readonly clinicMonogram = buildClinicMonogram(this.config.name, 'CL');
  readonly displayDoctorName = buildDoctorLabel(this.config.doctorName, this.config.name);

  readonly defaultClinicMoments: ClinicImage[] = [
    {
      src: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=900&q=80',
      alt: 'Modern treatment room',
      label: 'Treatment Room',
    },
    {
      src: 'https://placehold.co/480x360/EAF4FF/1E56DC?text=Reception',
      alt: 'Clinic reception area',
      label: 'Reception',
    },
    {
      src: 'https://placehold.co/480x360/F1F8FF/1E56DC?text=Sterilisation',
      alt: 'Sterilisation and hygiene area',
      label: 'Hygiene',
    },
  ];

  readonly defaultTrustPills = ['Same-day slots', 'No hidden charges', 'Gentle treatment'];

  readonly openFaq = signal<number | null>(null);
  toggleFaq(i: number) { this.openFaq.update(v => v === i ? null : i); }

  readonly showEmergencyBanner = signal(!sessionStorage.getItem('emergency_banner_seen'));
  dismissEmergencyBanner() {
    this.showEmergencyBanner.set(false);
    sessionStorage.setItem('emergency_banner_seen', '1');
  }

  readonly defaultFaqs: ClinicFaq[] = [
    { q: 'Will the treatment be painful?',            a: 'We use modern anaesthesia and gentle techniques so the vast majority of treatments are completely painless. For anxious patients we take extra time to make you comfortable before we begin.' },
    { q: 'How much does a typical treatment cost?',   a: 'Costs vary by treatment — a cleaning starts around ₹500, fillings from ₹800, and root canals from ₹3,000. We always tell you the exact price before starting. No hidden charges, ever.' },
    { q: 'Do you see children?',                      a: 'Yes! We welcome patients of all ages. We have a child-friendly approach and can treat kids from age 3 onwards for check-ups, cleanings, and early orthodontic guidance.' },
    { q: 'How do I manage or cancel my booking?',     a: 'Visit the "Manage Booking" page with your booking reference and phone number. You can view your details and contact us to reschedule any time before your appointment.' },
    { q: 'Are same-day appointments available?',      a: 'Yes — we keep emergency and same-day slots open most days. Book online and mention "urgent" in the notes, or call us directly for the fastest response.' },
    { q: 'How do I know my booking went through?',    a: 'You\'ll receive a booking reference number on screen immediately. The clinic will call or WhatsApp you within 2 hours to confirm the exact time slot.' },
  ];

  get previewServices()  { return this.config.services.slice(0, 6); }
  get hasTestimonials()  { return this.config.testimonials?.length > 0; }
  get heroHours()        { return this.config.hours.length ? this.config.hours.slice(0, 3) : [{ days: 'Mon - Sat', time: '9:00 AM - 7:00 PM' }]; }
  get homeContent(): ClinicHomeCustomization { return this.config.customization?.content?.home ?? {}; }
  get clinicMoments(): ClinicImage[] {
    const images = this.config.customization?.media?.clinicImages?.filter(image => image.src && image.alt) ?? [];
    return images.length ? images.slice(0, 3) : this.defaultClinicMoments;
  }
  get heroEyebrow()      { return this.homeContent.eyebrow || 'Dental Excellence'; }
  get heroTitle()        { return this.homeContent.heroTitle || 'Pain-Free Care'; }
  get heroHighlight()    { return this.homeContent.heroHighlight || 'You Can Trust'; }
  get heroSubtitle()     { return this.homeContent.heroSubtitle || 'Modern equipment, sterilized tools, and honest pricing - for every age, every visit.'; }
  get trustPills() {
    const pills = this.homeContent.trustPills?.filter(Boolean).slice(0, 4) ?? [];
    return pills.length ? pills : this.defaultTrustPills;
  }
  get finalCtaTitle()    { return this.homeContent.finalCtaTitle || 'Ready for a Healthier Smile?'; }
  get finalCtaSubtitle() { return this.homeContent.finalCtaSubtitle || 'Same-day slots available. Confirmed within 2 hours. No hidden charges.'; }
  get faqs(): ClinicFaq[] {
    const faqs = this.homeContent.faqs?.filter(faq => faq.q && faq.a).slice(0, 8) ?? [];
    return faqs.length ? faqs : this.defaultFaqs;
  }
}
