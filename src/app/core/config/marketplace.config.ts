export const MARKETPLACE_REGIONS = [
  { id: 'delhi-ncr', label: 'Delhi NCR' },
] as const;

export type MarketplaceRegionId = typeof MARKETPLACE_REGIONS[number]['id'];
export type MarketplaceListingStatus = 'unlisted' | 'pending' | 'verified' | 'suspended';

export const MARKETPLACE_DENTAL_SERVICES = [
  { id: 'dental-consultation', label: 'Dental Consultation' },
  { id: 'cleaning-scaling', label: 'Cleaning & Scaling' },
  { id: 'tooth-fillings', label: 'Tooth Fillings' },
  { id: 'root-canal', label: 'Root Canal Treatment' },
  { id: 'tooth-extraction', label: 'Tooth Extraction' },
  { id: 'wisdom-tooth', label: 'Wisdom Tooth Care' },
  { id: 'dental-implants', label: 'Dental Implants' },
  { id: 'crowns-bridges', label: 'Crowns & Bridges' },
  { id: 'dentures', label: 'Dentures' },
  { id: 'braces-orthodontics', label: 'Braces & Orthodontics' },
  { id: 'clear-aligners', label: 'Clear Aligners' },
  { id: 'pediatric-dentistry', label: 'Pediatric Dentistry' },
  { id: 'gum-treatment', label: 'Gum Treatment' },
  { id: 'teeth-whitening', label: 'Teeth Whitening' },
  { id: 'veneers-smile-design', label: 'Veneers & Smile Design' },
  { id: 'emergency-dental-care', label: 'Emergency Dental Care' },
] as const;

export type MarketplaceDentalServiceId = typeof MARKETPLACE_DENTAL_SERVICES[number]['id'];
export type MarketplacePaymentMethod = 'cash' | 'upi' | 'card' | 'insurance';

export interface MarketplaceProfile {
  region: MarketplaceRegionId;
  locality: string;
  latitude?: number | null;
  longitude?: number | null;
  serviceIds: MarketplaceDentalServiceId[];
  languages: string[];
  consultationFee?: number | null;
  paymentMethods: MarketplacePaymentMethod[];
  acceptingNewPatients: boolean;
  listingImageUrl?: string | null;
}

export interface ProviderVerification {
  clinicId: string;
  status: MarketplaceListingStatus;
  principalDentistName: string;
  registrationNumber: string;
  registrationCouncil: string;
  clinicAddressVerified: boolean;
  phoneVerified: boolean;
  googlePlaceId?: string | null;
  notes?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ProviderVerificationInput {
  principalDentistName: string;
  registrationNumber: string;
  registrationCouncil: string;
  clinicAddressVerified: boolean;
  phoneVerified: boolean;
  googlePlaceId?: string | null;
  notes?: string | null;
}

export interface MarketplaceListingAdminUpdate {
  status: MarketplaceListingStatus;
  slug?: string | null;
  verifiedDoctorIds: string[];
  profile?: MarketplaceProfile | null;
  verification: ProviderVerificationInput;
}