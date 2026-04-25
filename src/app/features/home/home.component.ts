import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ServiceCardComponent } from '../../shared/components/service-card/service-card.component';
import { TestimonialCardComponent } from '../../shared/components/testimonial-card/testimonial-card.component';
import { TreatmentFinderComponent } from '../../shared/components/treatment-finder/treatment-finder.component';
import { ClinicConfigService } from '../../core/services/clinic-config.service';
import type { ClinicFaq, ClinicHomeCustomization, ClinicImage } from '../../core/config/clinic.config';
import { RevealDirective } from '../../shared/directives/reveal.directive';
import {
  buildClinicMonogram,
  buildDoctorLabel,
  buildDoctorMonogram,
} from '../../core/utils/clinic-branding';

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
  readonly clinicMonogram = buildClinicMonogram(this.config.name, 'CL');
  readonly doctorMonogram = buildDoctorMonogram(this.config.doctorName, this.config.name);
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

  get previewServices()       { return this.config.services.slice(0, 6); }
  get hasTestimonials()       { return this.config.testimonials?.length > 0; }
  get duplicatedTestimonials(){ return [...(this.config.testimonials ?? []), ...(this.config.testimonials ?? [])]; }
  get doctorTitle()           { return this.config.doctorQualification || 'Dental Care Team'; }
  get heroHours()             { return this.config.hours.length ? this.config.hours.slice(0, 3) : [{ days: 'Mon - Sat', time: '9:00 AM - 7:00 PM' }]; }
  get homeContent(): ClinicHomeCustomization { return this.config.customization?.content?.home ?? {}; }
  get clinicMoments(): ClinicImage[] {
    const images = this.config.customization?.media?.clinicImages?.filter(image => image.src && image.alt) ?? [];
    return images.length ? images.slice(0, 3) : this.defaultClinicMoments;
  }
  get heroEyebrow()        { return this.homeContent.eyebrow || 'Dental Excellence'; }
  get heroTitle()          { return this.homeContent.heroTitle || 'Pain-Free Care'; }
  get heroHighlight()      { return this.homeContent.heroHighlight || 'You Can Trust'; }
  get heroSubtitle()       { return this.homeContent.heroSubtitle || 'Modern equipment, sterilized tools, and honest pricing - for every age, every visit.'; }
  get trustPills() {
    const pills = this.homeContent.trustPills?.filter(Boolean).slice(0, 4) ?? [];
    return pills.length ? pills : this.defaultTrustPills;
  }
  get doctorQuote()        { return this.homeContent.doctorQuote || 'I believe every patient deserves honest, pain-free care in a clean, modern environment. My goal is simple - give you the healthiest smile possible while making every visit comfortable.'; }
  get whyTitle()           { return this.homeContent.whyTitle || 'Dental Care That Puts You First'; }
  get whyBody()            { return this.homeContent.whyBody || `We built ${this.config.name || 'our clinic'} around one belief: every patient deserves honest, gentle care with no surprises.`; }
  get finalCtaTitle()      { return this.homeContent.finalCtaTitle || 'Ready for a Healthier Smile?'; }
  get finalCtaSubtitle()   { return this.homeContent.finalCtaSubtitle || 'Same-day slots available. Confirmed within 2 hours. No hidden charges.'; }
  get faqs(): ClinicFaq[] {
    const faqs = this.homeContent.faqs?.filter(faq => faq.q && faq.a).slice(0, 8) ?? [];
    return faqs.length ? faqs : this.defaultFaqs;
  }
}
