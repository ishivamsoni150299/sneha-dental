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
    { iconPath: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4', name: 'General Dentistry',       description: 'Comprehensive checkups, diagnosis, and preventive care to keep your teeth healthy for life.', benefit: 'Complete oral health check' },
    { iconPath: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z',                                               name: 'Dental Cleaning & Scaling', description: 'Professional scaling and polishing that removes plaque, tartar, and stains for a fresh, healthy mouth.',  benefit: 'Fresh mouth in 30 minutes' },
    { iconPath: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z',                                                        name: 'Tooth Fillings',           description: 'Tooth-coloured composite fillings that restore strength, function, and natural appearance.', benefit: 'Invisible, durable restoration' },
    { iconPath: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',                          name: 'Tooth Extraction',         description: 'Gentle simple and surgical extractions performed with local anaesthesia for minimal discomfort.', benefit: 'Gentle, quick procedure' },
    { iconPath: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4', name: 'Root Canal Treatment',    description: 'Advanced, pain-free RCT using modern rotary instruments to save your natural tooth.', benefit: 'Save your tooth, zero pain' },
    { iconPath: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z', name: 'Cosmetic Dentistry',       description: 'Smile makeovers, veneers, and bonding to transform your smile with precision and artistry.', benefit: 'Your dream smile, delivered' },
    { iconPath: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z',  name: 'Teeth Whitening',         description: 'Professional in-clinic whitening treatments for a noticeably brighter smile in just one visit.', benefit: 'Brighten your smile today' },
    { iconPath: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4',              name: 'Orthodontics',             description: 'Modern metal braces and clear aligners for children, teens, and adults who want a straighter smile.', benefit: 'Straighter smile, boosted confidence' },
    { iconPath: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', name: 'Dental Implants & Surgery', description: 'Permanent, natural-looking tooth replacements. Also covers crowns, bridges, and minor oral surgery.', benefit: 'Permanent, natural result' },
  ];
}
