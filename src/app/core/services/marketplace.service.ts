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

@Injectable({ providedIn: 'root' })
export class MarketplaceService {
  private readonly serviceLabels = new Map<MarketplaceDentalServiceId, string>(
    MARKETPLACE_DENTAL_SERVICES.map(service => [service.id, service.label]),
  );

  async getVerifiedClinics(region: MarketplaceRegionId): Promise<MarketplaceClinic[]> {
    const response = await fetch(`/api/marketplace/clinics?region=${encodeURIComponent(region)}`);
    if (!response.ok) throw new Error('Could not load dentists.');
    return (await response.json() as MarketplaceClinic[])
      .filter(clinic => clinic.active === true && clinic.marketplaceStatus === 'verified')
      .sort((first, second) =>
        String(second.marketplaceVerifiedAt ?? '').localeCompare(String(first.marketplaceVerifiedAt ?? '')),
      );
  }

  async getVerifiedClinicBySlug(slug: string): Promise<MarketplaceClinic | null> {
    const normalizedSlug = slug.trim().toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedSlug)) return null;

    const response = await fetch(`/api/marketplace/clinics/${encodeURIComponent(normalizedSlug)}`);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('Could not load this dentist.');
    return await response.json() as MarketplaceClinic;
  }

  async getPublishedReviews(clinicId: string): Promise<MarketplaceReview[]> {
    const normalizedClinicId = clinicId.trim();
    if (!normalizedClinicId || normalizedClinicId.includes('/')) return [];
    const response = await fetch(`/api/marketplace/clinics/${encodeURIComponent(normalizedClinicId)}/reviews`);
    if (!response.ok) throw new Error('Could not load reviews.');
    return await response.json() as MarketplaceReview[];
  }

  serviceLabel(serviceId: MarketplaceDentalServiceId): string {
    return this.serviceLabels.get(serviceId) ?? serviceId;
  }

  clinicWebsiteUrl(clinic: MarketplaceClinic): string | null {
    const customDomain = clinicHasPlatformFeature(clinic, 'customDomain')
      ? clinic.domain
      : null;
    const host = String(customDomain || clinic.vercelDomain || '').trim()
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