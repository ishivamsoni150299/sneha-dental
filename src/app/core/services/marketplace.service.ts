import { Injectable } from '@angular/core';
import {
  collection,
  getDocs,
  limit,
  query,
  where,
  type DocumentSnapshot,
} from 'firebase/firestore';
import type {
  ClinicConfig,
  MarketplaceDentalServiceId,
  MarketplaceRegionId,
} from '../config/clinic.config';
import { clinicHasPlatformFeature } from '../config/platform-entitlements';
import { MARKETPLACE_DENTAL_SERVICES } from '../config/marketplace.config';
import { db } from '../firebase';

export interface MarketplaceClinic extends ClinicConfig {
  id: string;
}

@Injectable({ providedIn: 'root' })
export class MarketplaceService {
  private readonly serviceLabels = new Map<MarketplaceDentalServiceId, string>(
    MARKETPLACE_DENTAL_SERVICES.map(service => [service.id, service.label]),
  );

  async getVerifiedClinics(region: MarketplaceRegionId): Promise<MarketplaceClinic[]> {
    const snapshot = await getDocs(query(
      collection(db, 'clinics'),
      where('marketplaceStatus', '==', 'verified'),
      limit(100),
    ));

    return snapshot.docs
      .map(document => this.toMarketplaceClinic(document))
      .filter((clinic): clinic is MarketplaceClinic =>
        clinic !== null && clinic.marketplaceProfile?.region === region,
      )
      .sort((first, second) =>
        String(second.marketplaceVerifiedAt ?? '').localeCompare(String(first.marketplaceVerifiedAt ?? '')),
      );
  }

  async getVerifiedClinicBySlug(slug: string): Promise<MarketplaceClinic | null> {
    const normalizedSlug = slug.trim().toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedSlug)) return null;

    const snapshot = await getDocs(query(
      collection(db, 'clinics'),
      where('marketplaceSlug', '==', normalizedSlug),
      limit(2),
    ));
    const clinic = snapshot.docs
      .map(document => this.toMarketplaceClinic(document))
      .find(candidate => candidate?.marketplaceSlug === normalizedSlug);
    return clinic ?? null;
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

  clinicBookingUrl(clinic: MarketplaceClinic): string | null {
    const website = this.clinicWebsiteUrl(clinic);
    return website ? `${website}/appointment` : null;
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

  private toMarketplaceClinic(document: DocumentSnapshot): MarketplaceClinic | null {
    if (!document.exists()) return null;
    const clinic = { id: document.id, ...document.data() } as MarketplaceClinic;
    if (
      clinic.active !== true ||
      clinic.marketplaceStatus !== 'verified' ||
      !clinic.marketplaceSlug ||
      !clinic.marketplaceProfile
    ) {
      return null;
    }
    return clinic;
  }
}