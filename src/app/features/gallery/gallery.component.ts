import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ClinicImage } from '../../core/config/clinic.config';
import { ClinicConfigService } from '../../core/services/clinic-config.service';

@Component({
  selector: 'app-gallery',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './gallery.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GalleryComponent {
  readonly config = inject(ClinicConfigService).config;

  private readonly fallbackClinicImages: ClinicImage[] = [
    { src: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=900&q=80', alt: 'Clinic reception area' },
    { src: 'https://images.unsplash.com/photo-1606811971618-4486d14f3f99?auto=format&fit=crop&w=900&q=80', alt: 'Treatment room' },
    { src: 'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&w=900&q=80', alt: 'Modern dental chair' },
    { src: 'https://images.unsplash.com/photo-1629909615184-74f495363b67?auto=format&fit=crop&w=900&q=80', alt: 'Sterilization equipment' },
    { src: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=900&q=80', alt: 'Comfortable waiting area' },
    { src: 'https://images.unsplash.com/photo-1581056771107-24ca5f033842?auto=format&fit=crop&w=900&q=80', alt: 'Digital X-ray room' },
  ];

  get clinicImages(): readonly ClinicImage[] {
    const configuredImages = this.config.customization?.media?.clinicImages;
    return configuredImages?.length ? configuredImages : this.fallbackClinicImages;
  }
}
