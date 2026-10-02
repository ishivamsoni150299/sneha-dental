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
    hostedDomain: 'smilecare.mydentalplatform.com',
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

  it('uses the independent practice fee and schedule without inventing hours', async () => {
    spyOn(window, 'fetch').and.resolveTo(new Response(JSON.stringify({
      id: 'sneha', slug: 'sneha', fullName: 'Sneha Soni', services: [],
      practiceLocations: [{ city: 'Noida', locality: 'Sector 53', addressLine1: 'Noida', consultationFee: 200, acceptingNewPatients: true, schedule: {} }],
    })));
    const profile = await service.getVerifiedProviderBySlug('sneha');
    expect(profile?.marketplaceProfile?.videoConsultationFee).toBe(200);
    expect(profile?.providerSchedule).toEqual({});
    expect(profile?.hours).toEqual([]);
    expect(profile?.city).toBe('Noida');
  });

  it('uses the hosted site for Free clinics even when a custom domain value exists', () => {
    expect(service.clinicWebsiteUrl(clinic())).toBe('https://smilecare.mydentalplatform.com');
  });

  it('preserves an affiliated dentist and every practice instead of substituting the booking clinic', async () => {
    const locations = [
      { id: 'pune', name: 'Pune Practice', clinicSlug: 'smile-care-noida', city: 'Pune', consultationFee: 500, acceptingNewPatients: true },
      { id: 'mumbai', name: 'Mumbai Practice', clinicSlug: 'mumbai-clinic', city: 'Mumbai', consultationFee: 700, acceptingNewPatients: false },
    ];
    spyOn(window, 'fetch').and.callFake(async input => new Response(JSON.stringify(
      String(input).includes('/api/v1/providers/')
        ? { id: 'person-id', slug: 'asha-verma', fullName: 'Dr Asha Verma', isIndependent: false, bookingSlug: 'smile-care-noida', practiceLocations: locations, services: ['root-canal'] }
        : clinic(),
    )));
    const profile = await service.getVerifiedProviderBySlug('asha-verma');
    expect(profile?.id).toBe('person-id'); expect(profile?.name).toBe('Dr Asha Verma');
    expect(profile?.marketplaceSlug).toBe('asha-verma'); expect(profile?.bookingSlug).toBe('smile-care-noida');
    expect(profile?.profileEntity).toBe('dentist'); expect(profile?.practiceLocations?.length).toBe(2);
    expect(profile?.marketplaceProfile?.consultationFee).toBe(500);
  });

  it('does not use a provider fallback for the strict clinic namespace', async () => {
    const fetch = spyOn(window, 'fetch').and.resolveTo(new Response('', { status: 404 }));
    expect(await service.getVerifiedClinicBySlug('unpublished', false)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
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
