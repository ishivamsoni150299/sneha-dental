import { Injectable, inject } from '@angular/core';
import type {
  ClinicConfig,
  ClinicHours,
  ClinicService,
  MarketplaceProfile,
  Testimonial,
} from '../config/clinic.config';
import type {
  MarketplaceListingAdminUpdate,
  ProviderVerification,
} from '../config/marketplace.config';
import { AuthenticatedApiService } from './authenticated-api.service';

export interface ClinicSettingsPayload {
  name?: string;
  doctorName?: string;
  doctorQualification?: string;
  patientCount?: string;
  doctorBio?: string[];
  phone?: string;
  phoneE164?: string;
  whatsappNumber?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  mapEmbedUrl?: string;
  mapDirectionsUrl?: string;
  hours?: ClinicHours[];
  services?: ClinicService[];
  testimonials?: Testimonial[];
  social?: { facebook?: string; instagram?: string; linkedin?: string };
  theme?: 'blue' | 'teal' | 'caramel' | 'emerald' | 'purple' | 'rose';
  logoDataUrl?: string | null;
  marketplaceProfile?: MarketplaceProfile;
  onboardingDismissed?: boolean;
  onboardingSharedWebsite?: boolean;
}

const CLINIC_SETTINGS_ALLOWED_KEYS = new Set<keyof ClinicSettingsPayload>([
  'name', 'doctorName', 'doctorQualification', 'patientCount', 'doctorBio',
  'phone', 'phoneE164', 'whatsappNumber', 'addressLine1', 'addressLine2', 'city',
  'mapEmbedUrl', 'mapDirectionsUrl', 'hours', 'services', 'testimonials', 'social',
  'theme', 'logoDataUrl', 'marketplaceProfile', 'onboardingDismissed', 'onboardingSharedWebsite',
]);

export interface PlatformCosts {
  hosting: number;
  database: number;
  domain: number;
  other: number;
}

export interface AppointmentDoc {
  id: string;
  clinicId: string;
  bookingRef: string;
  name: string;
  phone: string;
  service: string;
  date: string;
  time: string;
  status: 'pending' | 'confirmed' | 'checked_in' | 'completed' | 'no_show' | 'cancelled' | 'declined' | 'expired';
  source?: 'clinic_website' | 'marketplace' | 'voice' | 'voice_webhook' | 'chat';
  confirmationDeadline?: string;
  confirmationRespondedAt?: string;
  confirmationResponseMinutes?: number;
  confirmationSlaMissed?: boolean;
  confirmedAt?: string;
  createdAt?: string;
}

export interface StoredClinic extends ClinicConfig {
  id: string;
  domain: string;
  active: boolean;
  adminUid?: string;
  adminEmail?: string;
  createdAt?: string;
}

@Injectable({ providedIn: 'root' })
export class ClinicFirestoreService {
  private readonly api = inject(AuthenticatedApiService);

  async getAll(): Promise<StoredClinic[]> {
    return this.get<StoredClinic[]>('/api/admin/clinics');
  }

  async getById(id: string): Promise<StoredClinic | null> {
    return this.getNullable<StoredClinic>(`/api/admin/clinics/${encodeURIComponent(id)}`);
  }

  async getActive(): Promise<StoredClinic[]> {
    return (await this.getAll()).filter(clinic => clinic.active);
  }

  async getByDomain(domain: string): Promise<StoredClinic | null> {
    return this.getByHost(domain);
  }

  async getByHostedDomain(hostedDomain: string): Promise<StoredClinic | null> {
    return this.getByHost(hostedDomain);
  }

  async getByAdminUid(_uid: string): Promise<StoredClinic | null> {
    const response = await this.api.fetch('/api/clinics/current');
    if (!response.ok) return null;
    return await response.json() as StoredClinic;
  }

  async getProviderVerification(clinicId: string): Promise<ProviderVerification | null> {
    return this.getNullable<ProviderVerification>(
      `/api/admin/clinics/${encodeURIComponent(clinicId)}/verification`,
    );
  }

  async saveMarketplaceListing(
    clinicId: string,
    update: MarketplaceListingAdminUpdate,
    _reviewerUid: string,
  ): Promise<void> {
    await this.write(`/api/admin/clinics/${encodeURIComponent(clinicId)}/marketplace`, 'PATCH', update);
  }

  async getActiveSubscriptions(): Promise<StoredClinic[]> {
    return (await this.getAll()).filter(clinic => clinic.subscriptionStatus === 'active');
  }

  async create(data: Omit<StoredClinic, 'id' | 'createdAt'>): Promise<string> {
    const response = await this.api.fetch('/api/admin/clinics', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Clinic could not be created.');
    return (await response.json() as { id: string }).id;
  }

  async update(id: string, data: Partial<Omit<StoredClinic, 'id' | 'createdAt'>>): Promise<void> {
    await this.write(`/api/admin/clinics/${encodeURIComponent(id)}`, 'PATCH', data);
  }

  async remove(id: string): Promise<void> {
    await this.write(`/api/admin/clinics/${encodeURIComponent(id)}`, 'DELETE');
  }

  async getAllAppointments(): Promise<AppointmentDoc[]> {
    return this.get<AppointmentDoc[]>('/api/admin/appointments');
  }

  async getPlatformSettings(): Promise<PlatformCosts> {
    return this.get<PlatformCosts>('/api/admin/settings/costs');
  }

  async savePlatformSettings(costs: PlatformCosts): Promise<void> {
    await this.write('/api/admin/settings/costs', 'PATCH', costs);
  }

  async updateClinicSettings(id: string, data: ClinicSettingsPayload): Promise<void> {
    if (!id || id === 'default') throw new Error('Invalid clinic ID');
    const safeData = Object.fromEntries(
      Object.entries(data).filter(([key]) => CLINIC_SETTINGS_ALLOWED_KEYS.has(key as keyof ClinicSettingsPayload)),
    );
    if (Object.keys(safeData).length === 0) throw new Error('No clinic settings fields to update');
    await this.write('/api/clinics/current/settings', 'PATCH', safeData);
  }

  private async getByHost(host: string): Promise<StoredClinic | null> {
    return this.getNullable<StoredClinic>(`/api/admin/clinics/by-host?host=${encodeURIComponent(host)}`);
  }

  private async get<T>(url: string): Promise<T> {
    const response = await this.api.fetch(url);
    if (!response.ok) throw new Error('Platform data could not be loaded.');
    return await response.json() as T;
  }

  private async getNullable<T>(url: string): Promise<T | null> {
    const response = await this.api.fetch(url);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('Platform data could not be loaded.');
    return await response.json() as T;
  }

  private async write(url: string, method: string, body?: object): Promise<void> {
    const response = await this.api.fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw new Error('Platform update could not be saved.');
  }
}
