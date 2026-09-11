import { Injectable } from '@angular/core';
import type {
  ClinicConfig,
  MarketplaceDentalServiceId,
  MarketplaceRegionId,
} from '../config/clinic.config';
import { clinicHasPlatformFeature } from '../config/platform-entitlements';
import { MARKETPLACE_DENTAL_SERVICES } from '../config/marketplace.config';

export interface MarketplaceClinic extends ClinicConfig {
  id: string;
  averageRating?: number;
  ratingCount?: number;
  isIndependent?: boolean;
  eligibleForInClinic?: boolean;
  eligibleForVideo?: boolean;
  consultationModes?: ('in_person' | 'video')[];
}

export interface MarketplaceSearchResponse {
  dentists: MarketplaceClinic[];
  totalCount: number;
  limit: number;
  offset: number;
}

export interface MarketplaceProvider {
  id: string; slug: string; fullName: string; qualification: string | null;
  speciality: string | null; experienceYears: number | null; languages: string[];
  locationId: string; locationName: string; locality: string | null; city: string;
  consultationFee: number | null; acceptingNewPatients: boolean;
  serviceIds?: string[];
  isIndependent?: boolean;
  eligibleForInClinic?: boolean;
  eligibleForVideo?: boolean;
  consultationModes?: ('in_person' | 'video')[];
}

export interface MarketplaceReview {
  id: string;
  clinicId: string;
  rating: number;
  text: string;
  patientAlias: string;
  publishedAt: string | null;
  clinicResponse: string;
  clinicRespondedAt: string | null;
}

export interface MarketplaceAvailabilitySlot {
  doctorId: string;
  doctorName: string;
  time: string;
  startsAt: string;
}

export interface MarketplaceAvailabilityDay {
  date: string;
  slots: MarketplaceAvailabilitySlot[];
}

export interface MarketplaceAvailability {
  dentistSlug: string;
  timezone: string;
  days: MarketplaceAvailabilityDay[];
}

@Injectable({ providedIn: 'root' })
export class MarketplaceService {
  async getVerifiedProviders(): Promise<MarketplaceProvider[]> {
    const providers: MarketplaceProvider[] = [];
    let total = 1;
    while (providers.length < total) {
      const response = await fetch(`/api/v1/providers?limit=50&offset=${providers.length}`);
      if (!response.ok) throw new Error('Could not load verified dentist profiles.');
      const page = await response.json() as { providers: MarketplaceProvider[]; totalCount: number };
      if (!page.providers.length) break;
      providers.push(...page.providers);
      total = page.totalCount;
    }
    return providers;
  }
  async videoAvailable(): Promise<boolean> {
    try {
      const response = await fetch('/api/public/video-consultations/status');
      return response.ok && (await response.json()).available === true;
    } catch { return false; }
  }
  private readonly serviceLabels = new Map<MarketplaceDentalServiceId, string>(
    MARKETPLACE_DENTAL_SERVICES.map(service => [service.id, service.label]),
  );

  async getVerifiedClinics(
    region: MarketplaceRegionId,
    options?: { limit?: number; offset?: number },
  ): Promise<MarketplaceSearchResponse> {
    const params = new URLSearchParams({ region });
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    const response = await fetch(`/api/marketplace/clinics?${params}`);
    if (!response.ok) throw new Error('Could not load dentists.');
    const data = await response.json();
    return {
      dentists: data.dentists ?? data,
      totalCount: data.totalCount ?? (data.dentists ?? data).length,
      limit: data.limit ?? 50,
      offset: data.offset ?? 0,
    };
  }

  async getVerifiedClinicBySlug(slug: string): Promise<MarketplaceClinic | null> {
    const normalizedSlug = slug.trim().toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedSlug)) return null;

    const response = await fetch(`/api/marketplace/clinics/${encodeURIComponent(normalizedSlug)}`);
    if (response.status === 404) {
      return await this.getVerifiedProviderBySlug(normalizedSlug);
    }
    if (!response.ok) throw new Error('Could not load this dentist.');
    return await response.json() as MarketplaceClinic;
  }

  async getVerifiedProviderBySlug(slug: string): Promise<MarketplaceClinic | null> {
    const normalizedSlug = slug.trim().toLowerCase();
    try {
      const response = await fetch(`/api/v1/providers/${encodeURIComponent(normalizedSlug)}`);
      if (!response.ok) return null;
      const provider = await response.json() as {
        id: string; slug: string; fullName: string; qualification?: string; speciality?: string;
        biography?: string; phoneE164?: string; city?: string; locality?: string;
        experienceYears?: number; consultationFee?: number; acceptingNewPatients?: boolean;
        services?: string[]; languages?: string[];
      };
      return {
        id: String(provider.id),
        name: provider.fullName,
        tagline: provider.speciality || 'Independent Dental Professional',
        doctorName: provider.fullName,
        doctorQualification: provider.qualification || '',
        doctorBio: provider.biography || '',
        phone: provider.phoneE164 || '',
        phoneE164: provider.phoneE164 || '',
        city: provider.city || 'Delhi NCR',
        bookingRefPrefix: 'MDP',
        isIndependent: true,
        eligibleForInClinic: false,
        eligibleForVideo: true,
        consultationModes: ['video'],
        marketplaceSlug: provider.slug,
        marketplaceStatus: 'verified',
        marketplaceProfile: {
          region: 'delhi-ncr',
          locality: provider.locality || 'Delhi NCR',
          speciality: provider.speciality,
          experienceYears: provider.experienceYears,
          consultationFee: provider.consultationFee,
          videoConsultationFee: provider.consultationFee,
          videoConsultationEnabled: true,
          acceptingNewPatients: provider.acceptingNewPatients ?? true,
          serviceIds: provider.services || ['video-consultation'],
          languages: provider.languages || [],
        },
        services: [{
          name: 'Video Consultation',
          price: provider.consultationFee ? `₹${provider.consultationFee}` : undefined,
          duration: '30 mins',
          description: 'Remote video consultation with verified independent dentist',
        }],
        testimonials: [],
        hours: [{ days: 'Mon-Sat', time: '09:00 AM - 07:00 PM' }],
        marketplaceVerifiedDoctorIds: [String(provider.id)],
      } as unknown as MarketplaceClinic;
    } catch {
      return null;
    }
  }

  async getPublishedReviews(clinicId: string): Promise<MarketplaceReview[]> {
    const normalizedClinicId = clinicId.trim();
    if (!normalizedClinicId || normalizedClinicId.includes('/')) return [];
    const response = await fetch(`/api/marketplace/clinics/${encodeURIComponent(normalizedClinicId)}/reviews`);
    if (!response.ok) throw new Error('Could not load reviews.');
    return await response.json() as MarketplaceReview[];
  }

  async getAvailability(slug: string, days = 7): Promise<MarketplaceAvailability> {
    const response = await fetch(
      `/api/v1/dentists/${encodeURIComponent(slug)}/availability?days=${days}`,
    );
    if (!response.ok) throw new Error('Could not load appointment times.');
    return await response.json() as MarketplaceAvailability;
  }

  serviceLabel(serviceId: MarketplaceDentalServiceId): string {
    return this.serviceLabels.get(serviceId) ?? serviceId;
  }

  clinicWebsiteUrl(clinic: MarketplaceClinic): string | null {
    const customDomain = clinicHasPlatformFeature(clinic, 'customDomain')
      ? clinic.domain
      : null;
    const host = String(customDomain || clinic.hostedDomain || '').trim()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '');
    return host ? `https://${host}` : null;
  }

  listingImage(clinic: MarketplaceClinic): string {
    return clinic.marketplaceProfile?.listingImageUrl ||
      clinic.customization?.media?.clinicImages?.[0]?.src ||
      clinic.logoDataUrl ||
      '/assets/brand/mydentalplatform-logo-full.svg';
  }

  hasListingPhoto(clinic: MarketplaceClinic): boolean {
    return Boolean(
      clinic.marketplaceProfile?.listingImageUrl ||
      clinic.customization?.media?.clinicImages?.[0]?.src,
    );
  }

}
