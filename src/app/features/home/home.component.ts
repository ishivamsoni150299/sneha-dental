import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SectionHeaderComponent } from '../../shared/components/section-header/section-header.component';
import { ServiceCardComponent } from '../../shared/components/service-card/service-card.component';
import { TestimonialCardComponent } from '../../shared/components/testimonial-card/testimonial-card.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, SectionHeaderComponent, ServiceCardComponent, TestimonialCardComponent],
  templateUrl: './home.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {

  trustStats = [
    { value: '1000+', label: 'Happy Patients',    icon: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z' },
    { value: 'Modern', label: 'Equipment',         icon: 'M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18' },
    { value: '100%',   label: 'Sterilized Tools',  icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
    { value: 'BDS',    label: 'Qualified Dentist',  icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  ];

  previewServices = [
    { iconPath: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4', name: 'Root Canal Treatment',    description: 'Advanced, painless RCT using modern rotary instruments.', benefit: 'Save your tooth, zero pain' },
    { iconPath: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z', name: 'Teeth Whitening',         description: 'Professional-grade whitening for a radiant, confident smile.', benefit: 'Brighten in one visit' },
    { iconPath: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', name: 'Dental Implants',          description: 'Permanent tooth replacement that looks and feels completely natural.', benefit: 'Permanent, natural result' },
    { iconPath: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z', name: 'Dental Cleaning',          description: 'Professional scaling and polishing for a fresh, healthy mouth.', benefit: 'Fresh mouth in 30 min' },
    { iconPath: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z', name: 'Tooth Fillings',           description: 'Invisible composite fillings that restore strength and aesthetics.', benefit: 'Invisible, durable fix' },
    { iconPath: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4', name: 'Orthodontics',             description: 'Modern braces and clear aligners for a perfectly aligned smile.', benefit: 'Straighter smile, boosted confidence' },
  ];

  features = [
    { icon: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z', title: 'Gentle & Pain-Free',      desc: 'Modern techniques ensure comfortable, painless treatment every visit.' },
    { icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',                                                                                     title: 'Honest Advice',           desc: 'We recommend only what you truly need - no upselling, ever.' },
    { icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z', title: 'Transparent Pricing',     desc: 'Know the full cost before we start. No hidden charges, ever.' },
    { icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',                                              title: 'Modern & Hygienic',       desc: 'Latest equipment with fully sterilized tools in a spotless clinic.' },
  ];

  testimonials = [
    { name: 'Priya M.',   location: 'Pune - Verified Patient',    rating: 5, review: 'I was terrified of dentists all my life. Dr. Sneha made my root canal completely painless. I could not believe it!' },
    { name: 'Rahul S.',   location: 'Mumbai - Verified Patient',  rating: 5, review: 'Got my root canal done here. Zero pain, zero drama. The staff is incredibly professional and kind.' },
    { name: 'Anita K.',   location: 'Nashik - Verified Patient',  rating: 5, review: 'Best dental clinic I have ever been to. Transparent pricing and no hidden costs. Highly recommend Sneha Dental!' },
  ];
}
