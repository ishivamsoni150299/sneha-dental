import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ServiceCardComponent } from '../../shared/components/service-card/service-card.component';

@Component({
  selector: 'app-services',
  standalone: true,
  imports: [RouterLink, ServiceCardComponent],
  templateUrl: './services.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServicesComponent {

  services = [
    { iconPath: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',        name: 'General Dentistry',        description: 'Comprehensive checkups, X-rays, and preventive care for the whole family.', benefit: 'Complete oral health check', price: '₹300 – ₹600' },
    { iconPath: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z',                                               name: 'Cleaning & Scaling',       description: 'Professional scaling and polishing removes plaque, tartar, and stains.', benefit: 'Fresh mouth in 30 minutes', price: '₹800 – ₹1,500' },
    { iconPath: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z',                                                        name: 'Tooth Fillings',           description: 'Tooth-coloured composite fillings restore strength and natural appearance.', benefit: 'Invisible, durable fix', price: '₹500 – ₹1,500' },
    { iconPath: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',                          name: 'Tooth Extraction',         description: 'Gentle simple and surgical extractions with local anaesthesia.', benefit: 'Gentle, quick procedure', price: '₹400 – ₹2,500' },
    { iconPath: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',        name: 'Root Canal Treatment',    description: 'Pain-free RCT using modern rotary instruments to save your natural tooth.', benefit: 'Save your tooth, zero pain', price: '₹3,500 – ₹8,000' },
    { iconPath: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z', name: 'Cosmetic Dentistry', description: 'Smile makeovers, veneers, and bonding to transform your smile.', benefit: 'Your dream smile, delivered', price: '₹2,000 onwards' },
    { iconPath: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z',  name: 'Teeth Whitening',         description: 'Professional in-clinic whitening for a noticeably brighter smile in one visit.', benefit: 'Brighten in one visit', price: '₹3,000 – ₹7,000' },
    { iconPath: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4',              name: 'Orthodontics',            description: 'Metal braces and clear aligners for children, teens, and adults.', benefit: 'Straighter smile, boosted confidence', price: '₹18,000 – ₹80,000' },
    { iconPath: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', name: 'Dental Implants', description: 'Permanent natural-looking replacements with titanium implants. Covers crowns and bridges.', benefit: 'Permanent, natural result', price: '₹25,000 – ₹55,000' },
  ];

  plans = [
    {
      tag: 'Best for Individuals',
      tagColor: 'bg-blue-100 text-blue-700',
      name: 'Dental Health Plan',
      subtitle: 'Ideal for students & working professionals',
      price: '₹1,999',
      period: '/year',
      highlighted: false,
      features: [
        '2 free checkups per year',
        '1 free cleaning & scaling',
        'Free X-rays (2 per year)',
        '15% discount on all treatments',
        'Priority appointment booking',
        'No hidden charges',
      ],
    },
    {
      tag: 'Most Popular',
      tagColor: 'bg-white text-blue-600',
      name: 'Super Speciality Plan',
      subtitle: 'Best for families (covers up to 4 members)',
      price: '₹4,999',
      period: '/year',
      highlighted: true,
      features: [
        '4 free checkups per year',
        '2 free cleaning & scaling',
        'Free X-rays (unlimited)',
        '25% discount on all treatments',
        'Priority same-day booking',
        '1 free teeth whitening consultation',
        'Covers up to 4 family members',
        'Emergency dental helpline',
      ],
    },
  ];
}
