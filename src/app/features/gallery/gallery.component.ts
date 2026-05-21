import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { NgClass } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ClinicConfigService } from '../../core/services/clinic-config.service';

@Component({
  selector: 'app-gallery',
  standalone: true,
  imports: [NgClass, RouterLink],
  templateUrl: './gallery.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GalleryComponent {
  readonly config = inject(ClinicConfigService).config;
  clinicImages = [
    { src: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=900&q=80', alt: 'Clinic reception area' },
    { src: 'https://images.unsplash.com/photo-1606811971618-4486d14f3f99?auto=format&fit=crop&w=900&q=80', alt: 'Treatment room' },
    { src: 'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&w=900&q=80', alt: 'Modern dental chair' },
    { src: 'https://images.unsplash.com/photo-1629909615184-74f495363b67?auto=format&fit=crop&w=900&q=80', alt: 'Sterilization equipment' },
    { src: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=900&q=80', alt: 'Comfortable waiting area' },
    { src: 'https://images.unsplash.com/photo-1581056771107-24ca5f033842?auto=format&fit=crop&w=900&q=80', alt: 'Digital X-ray room' },
  ];

  transformations = [
    { before: 'https://images.unsplash.com/photo-1606811841689-23dfddce3e95?auto=format&fit=crop&w=600&q=80', after: 'https://images.unsplash.com/photo-1606811841689-23dfddce3e95?auto=format&fit=crop&w=600&q=80', label: 'Smile Makeover' },
    { before: 'https://images.unsplash.com/photo-1609840114035-3c981b782dfe?auto=format&fit=crop&w=600&q=80', after: 'https://images.unsplash.com/photo-1609840114035-3c981b782dfe?auto=format&fit=crop&w=600&q=80', label: 'Teeth Whitening' },
    { before: 'https://images.unsplash.com/photo-1593022356769-11f762e25ed9?auto=format&fit=crop&w=600&q=80', after: 'https://images.unsplash.com/photo-1593022356769-11f762e25ed9?auto=format&fit=crop&w=600&q=80', label: 'Orthodontic Result' },
  ];
}
