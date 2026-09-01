import type { MarketplaceClinic } from './marketplace.service';
import { MarketplaceService } from './marketplace.service';

function clinic(overrides: Partial<MarketplaceClinic> = {}): MarketplaceClinic {
  return {
    id: 'clinic-1',
    clinicId: 'clinic-1',
    name: 'Smile Care',
    doctorName: 'Dr. Asha Verma',
    doctorBio: [],
    patientCount: '500+',
    rating: '',
    phone: '+91 90000 00000',
    phoneE164: '919000000000',
    whatsappNumber: '919000000000',
    addressLine1: 'Sector 18',
    addressLine2: '',
    city: 'Noida',
    mapEmbedUrl: '',
    mapDirectionsUrl: '',
    active: true,
    marketplaceStatus: 'verified',
    marketplaceSlug: 'smile-care-noida',
    marketplaceProfile: {
      region: 'delhi-ncr',
      locality: 'Sector 18, Noida',
      serviceIds: ['root-canal'],
      languages: ['Hindi', 'English'],
      paymentMethods: ['upi'],
      acceptingNewPatients: true,
    },
    subscriptionPlan: 'trial',
    subscriptionStatus: 'trial',
    domain: 'smilecare.example',
    vercelDomain: 'smilecare.mydentalplatform.com',
    theme: 'blue',
    bookingRefPrefix: 'SC',
    social: {},
    hours: [],
    services: [],
    plans: [],
    testimonials: [],
    ...overrides,
  };
}

describe('MarketplaceService public URLs', () => {
  const service = new MarketplaceService();

  it('uses the hosted site for Free clinics even when a custom domain value exists', () => {
    expect(service.clinicWebsiteUrl(clinic())).toBe('https://smilecare.mydentalplatform.com');
  });

  it('uses the custom domain only for an active paid entitlement', () => {
    const basicClinic = clinic({ subscriptionPlan: 'starter', subscriptionStatus: 'active' });
    const expiredClinic = clinic({ subscriptionPlan: 'starter', subscriptionStatus: 'expired' });

    expect(service.clinicWebsiteUrl(basicClinic)).toBe('https://smilecare.example');
    expect(service.clinicWebsiteUrl(expiredClinic)).toBe('https://smilecare.mydentalplatform.com');
  });

  it('prefers a real listing image and resolves canonical service labels', () => {
    const listedClinic = clinic({
      marketplaceProfile: {
        ...clinic().marketplaceProfile!,
        listingImageUrl: 'https://images.example/clinic.jpg',
      },
    });

    expect(service.listingImage(listedClinic)).toBe('https://images.example/clinic.jpg');
    expect(service.hasListingPhoto(listedClinic)).toBeTrue();
    expect(service.serviceLabel('root-canal')).toBe('Root Canal Treatment');
  });
});