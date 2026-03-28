import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-gallery',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './gallery.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GalleryComponent {
  clinicImages = [
    { src: 'https://placehold.co/600x400/EFF6FF/2563EB?text=Reception+Area',     alt: 'Clinic reception area' },
    { src: 'https://placehold.co/600x400/EFF6FF/2563EB?text=Treatment+Room+1',   alt: 'Treatment room' },
    { src: 'https://placehold.co/600x400/EFF6FF/2563EB?text=Treatment+Room+2',   alt: 'Modern dental chair' },
    { src: 'https://placehold.co/600x400/EFF6FF/2563EB?text=Sterilization+Area', alt: 'Sterilization equipment' },
    { src: 'https://placehold.co/600x400/EFF6FF/2563EB?text=Waiting+Lounge',     alt: 'Comfortable waiting area' },
    { src: 'https://placehold.co/600x400/EFF6FF/2563EB?text=X-Ray+Room',         alt: 'Digital X-ray room' },
  ];

  transformations = [
    { before: 'https://placehold.co/400x300/FEF2F2/DC2626?text=Before', after: 'https://placehold.co/400x300/F0FDF4/16A34A?text=After', label: 'Smile Makeover' },
    { before: 'https://placehold.co/400x300/FEF2F2/DC2626?text=Before', after: 'https://placehold.co/400x300/F0FDF4/16A34A?text=After', label: 'Teeth Whitening' },
    { before: 'https://placehold.co/400x300/FEF2F2/DC2626?text=Before', after: 'https://placehold.co/400x300/F0FDF4/16A34A?text=After', label: 'Orthodontic Result' },
  ];
}
