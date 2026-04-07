import { Component, signal, computed, ChangeDetectionStrategy, OnInit, inject } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { hasGoogleMapsKey, loadGoogleMapsScript } from '../../../../core/utils/google-maps-loader';
import { LeadSource } from '../../../../core/services/lead-firestore.service';

interface DiscoveredClinic {
  placeId:      string;
  name:         string;
  address:      string;
  city:         string;
  rating?:      number;
  totalRatings?: number;
  hasWebsite:   boolean;
}

@Component({
  selector: 'app-lead-discover',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './lead-discover.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LeadDiscoverComponent implements OnInit {
  private router = inject(Router);

  city      = signal('');
  searching = signal(false);
  results   = signal<DiscoveredClinic[]>([]);
  error     = signal<string | null>(null);
  apiReady  = signal(false);
  searched  = signal(false);

  hasKey = hasGoogleMapsKey();

  noWebsiteCount = computed(() => this.results().filter(r => !r.hasWebsite).length);

  async ngOnInit() {
    if (!this.hasKey) return;
    try {
      await loadGoogleMapsScript();
      this.apiReady.set(true);
    } catch {
      this.error.set('Failed to load Google Maps. Check your API key.');
    }
  }

  async search() {
    const city = this.city().trim();
    if (!city || !this.apiReady()) return;
    this.searching.set(true);
    this.error.set(null);
    this.results.set([]);
    this.searched.set(false);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new (window as any).google.maps.places.PlacesService(
      document.createElement('div')
    );

    service.textSearch(
      { query: `dental clinic ${city}`, type: 'dentist' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (results: any[], status: string) => {
        if (status !== 'OK' && status !== 'ZERO_RESULTS') {
          this.error.set(`Search failed: ${status}. Check your API key or try a different city.`);
          this.searching.set(false);
          return;
        }
        const mapped: DiscoveredClinic[] = (results ?? []).map(r => ({
          placeId:      r.place_id,
          name:         r.name,
          address:      r.formatted_address ?? '',
          city:         this.extractCity(r.formatted_address ?? '', city),
          rating:       r.rating,
          totalRatings: r.user_ratings_total,
          hasWebsite:   !!r.website,
        }));
        // Sort: no-website clinics first (prime prospects)
        mapped.sort((a, b) => Number(a.hasWebsite) - Number(b.hasWebsite));
        this.results.set(mapped);
        this.searched.set(true);
        this.searching.set(false);
      }
    );
  }

  addToPipeline(clinic: DiscoveredClinic) {
    this.router.navigate(['/business/leads/new'], {
      queryParams: {
        clinicName: clinic.name,
        city:       clinic.city,
        source:     'google_maps' as LeadSource,
      },
    });
  }

  private extractCity(address: string, fallback: string): string {
    const parts = address.split(',').map(p => p.trim());
    // City is usually 2nd or 3rd segment from the end (before state + country)
    return parts.length >= 3 ? parts[parts.length - 3] : fallback;
  }

  stars(rating: number): number[] {
    return Array.from({ length: Math.round(rating) });
  }
}
