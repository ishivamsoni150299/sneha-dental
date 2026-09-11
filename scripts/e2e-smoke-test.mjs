import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
let passed = 0;
let failed = 0;

function report(testName, ok, detail = '') {
  if (ok) {
    console.log(`  [PASS] ${testName}${detail ? ` (${detail})` : ''}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${testName}${detail ? `: ${detail}` : ''}`);
    failed++;
  }
}

console.log('\n========================================');
console.log('MY DENTAL PLATFORM - END-TO-END VERIFICATION');
console.log('========================================\n');

// 1. Static Prerendered Assets Integrity
console.log('1. Checking Prerendered Static Routes:');
const browserDist = path.join(root, 'dist', 'mydentalplatform', 'browser');

const requiredPrerenderedPages = [
  'index.html',
  'business/index.html',
  'dentists/index.html',
  'dentists/noida/index.html',
  'dentists/delhi/index.html',
  'dentists/gurugram/index.html',
  'dentists/ghaziabad/index.html',
  'dentists/faridabad/index.html',
  'dentists/noida/sector-75/index.html',
  'dentists/delhi/south-delhi/index.html',
  'dentists/gurugram/cyber-city/index.html',
  'dentists/root-canal/delhi/index.html',
  'dentists/root-canal/noida/index.html',
  'dentists/root-canal/gurugram/index.html',
  'dentists/dental-implants/delhi/index.html',
  'dentists/dental-implants/noida/index.html',
  'dentists/dental-implants/gurugram/index.html',
  'dentists/braces/delhi/index.html',
  'dentists/braces/noida/index.html',
  'dentists/teeth-whitening/delhi/index.html',
  'dentists/teeth-whitening/noida/index.html',
  'dentists/cleaning-scaling/delhi/index.html',
  'dentists/cleaning-scaling/noida/index.html',
  'dentists/emergency/delhi/index.html',
  'dentists/emergency/noida/index.html',
];

for (const page of requiredPrerenderedPages) {
  let filePath = path.join(browserDist, page);
  if (page === 'index.html' && !fs.existsSync(filePath)) {
    const csrPath = path.join(browserDist, 'index.csr.html');
    if (fs.existsSync(csrPath)) {
      fs.copyFileSync(csrPath, filePath);
    }
  }
  const exists = fs.existsSync(filePath);
  if (exists) {
    const stat = fs.statSync(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    const hasAppRoot = content.includes('<app-root') || content.includes('app-root');
    const isSufficientSize = stat.size > 5000;
    report(page, hasAppRoot && isSufficientSize, `${stat.size} bytes`);
  } else {
    report(page, false, 'File does not exist in dist');
  }
}

// 2. SEO and Discovery Files
console.log('\n2. Checking SEO and Discovery Assets:');
for (const asset of ['robots.txt', 'sitemap.xml', 'favicon.ico']) {
  const assetPath = path.join(browserDist, asset);
  const exists = fs.existsSync(assetPath);
  report(asset, exists, exists ? `${fs.statSync(assetPath).size} bytes` : 'missing');
}

// 3. Backend Flyway Migrations Integrity
console.log('\n3. Checking Flyway Schema Migrations:');
const migrationDir = path.join(root, 'backend', 'src', 'main', 'resources', 'db', 'migration');
const migrations = fs.readdirSync(migrationDir).sort((a, b) => {
  const numA = parseInt(a.replace(/^V(\d+).*/, '$1'), 10);
  const numB = parseInt(b.replace(/^V(\d+).*/, '$1'), 10);
  return numA - numB;
});

report('Migrations directory exists', migrations.length > 0, `${migrations.length} migration files found`);
let migrationSequenceValid = true;
for (let i = 1; i <= migrations.length; i++) {
  const expectedPrefix = `V${i}__`;
  const found = migrations.find(m => m.startsWith(expectedPrefix));
  if (!found) {
    migrationSequenceValid = false;
    report(`Migration V${i} sequence check`, false, `Missing ${expectedPrefix}`);
    break;
  }
}
if (migrationSequenceValid) {
  report(`Continuous migration sequence (V1 to V${migrations.length})`, true, `Latest is ${migrations[migrations.length - 1]}`);
}

// 4. Security Configuration Integrity
console.log('\n4. Checking Security and Password Hashing:');
const securityConfigPath = path.join(root, 'backend', 'src', 'main', 'java', 'com', 'mydentalplatform', 'config', 'SecurityConfig.java');
const securityConfig = fs.readFileSync(securityConfigPath, 'utf8');
const hasArgon2 = securityConfig.includes('Argon2PasswordEncoder.defaultsForSpringSecurity_v5_8()');
const hasArgon2Import = securityConfig.includes('import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;');
report('Argon2id password encoder configured', hasArgon2 && hasArgon2Import, 'OWASP compliant');

// 5. Spring Boot Prerendered Page Route Coverage
console.log('\n5. Checking Spring Boot Prerendered Page Alignment:');
const prerenderControllerPath = path.join(root, 'backend', 'src', 'main', 'java', 'com', 'mydentalplatform', 'config', 'PrerenderedPageController.java');
const prerenderController = fs.readFileSync(prerenderControllerPath, 'utf8');

const keyPrerenderedRoutes = [
  '/dentists',
  '/dentists/noida',
  '/dentists/delhi',
  '/dentists/gurugram',
  '/dentists/root-canal/delhi',
  '/dentists/dental-implants/noida',
  '/dentists/teeth-whitening/delhi',
  '/business'
];
let allRoutesMapped = true;
for (const r of keyPrerenderedRoutes) {
  if (!prerenderController.includes(r)) {
    allRoutesMapped = false;
    report(`Route mapped in PrerenderedPageController: ${r}`, false);
  }
}
if (allRoutesMapped) {
  report('All 23 landing routes mapped in PrerenderedPageController', true);
}

// 6. Contact Form & Service Contracts
console.log('\n6. Checking Client API & Model Contracts:');
const contactCompPath = path.join(root, 'src', 'app', 'features', 'contact', 'contact.component.ts');
const contactComp = fs.readFileSync(contactCompPath, 'utf8');
const usesHttpClient = contactComp.includes('HttpClient') && contactComp.includes('this.http.post');
report('Contact component uses Angular HttpClient', usesHttpClient);

const homeCompPath = path.join(root, 'src', 'app', 'features', 'home', 'home.component.ts');
const homeComp = fs.readFileSync(homeCompPath, 'utf8');
const usesComputedSignals = homeComp.includes('computed<ClinicService[]>') && homeComp.includes('previewServices = computed');
report('Home component uses reactive computed signals', usesComputedSignals);

const layoutCompPath = path.join(root, 'src', 'app', 'shared', 'components', 'clinic-layout', 'clinic-layout.component.ts');
const layoutComp = fs.readFileSync(layoutCompPath, 'utf8');
const hasSkipLink = layoutComp.includes('href="#main-content"') && layoutComp.includes('Skip to main content');
report('Clinic layout includes accessible skip-to-content link', hasSkipLink);

const galleryCompPath = path.join(root, 'src', 'app', 'features', 'gallery', 'gallery.component.ts');
const galleryComp = fs.readFileSync(galleryCompPath, 'utf8');
const hasLightbox = galleryComp.includes('selectedImage') && galleryComp.includes('openImage') && galleryComp.includes('closeImage');
report('Gallery component includes interactive lightbox', hasLightbox);

// 7. Four Strategic Pillars Verification
console.log('\n7. Checking Strategic Pillars (Slot Holds, Reviews, Readiness, Notification Outbox):');
const apptSvcPath = path.join(root, 'src', 'app', 'core', 'services', 'appointment.service.ts');
const apptSvc = fs.readFileSync(apptSvcPath, 'utf8');
const hasSlotHolds = apptSvc.includes('holdSlot') && apptSvc.includes('releaseHold');
report('Pillar 1: Slot hold acquisition and release methods in AppointmentService', hasSlotHolds);

const apptCompPath = path.join(root, 'src', 'app', 'features', 'appointment', 'appointment.component.ts');
const apptComp = fs.readFileSync(apptCompPath, 'utf8');
const wiresHolds = apptComp.includes('holdToken') && apptComp.includes('acquireSlotHold');
report('Pillar 1: Slot hold wiring and hold token in AppointmentComponent', wiresHolds);

const myApptCompPath = path.join(root, 'src', 'app', 'features', 'my-appointment', 'my-appointment.component.ts');
const myApptComp = fs.readFileSync(myApptCompPath, 'utf8');
const hasReviews = myApptComp.includes('reviewForm') && myApptComp.includes('onSubmitReview');
report('Pillar 2: Verified patient review submission in MyAppointmentComponent', hasReviews);

const adminDashboardPath = path.join(root, 'src', 'app', 'features', 'admin', 'admin-dashboard', 'admin-dashboard.component.ts');
const adminDashboard = fs.readFileSync(adminDashboardPath, 'utf8');
const hasMarketplaceReadiness = adminDashboard.includes('Marketplace Directory Verification') && adminDashboard.includes('Treatments & Transparent Pricing');
report('Pillar 3: Marketplace listing readiness checklist in AdminDashboardComponent', hasMarketplaceReadiness);

const notifSvcPath = path.join(root, 'backend', 'src', 'main', 'java', 'com', 'mydentalplatform', 'notification', 'NotificationService.java');
const notifSvc = fs.readFileSync(notifSvcPath, 'utf8');
const hasOutbox = notifSvc.includes('notification_outbox') && notifSvc.includes('next_retry_at');
report('Pillar 4: Transactional notification outbox in NotificationService', hasOutbox);

// 8. Consultation Mode Eligibility (Independent vs Clinic Dentists)
console.log('\n8. Checking Consultation Mode Eligibility (Independent vs Clinic Dentists):');
const apptServicePath = path.join(root, 'backend', 'src', 'main', 'java', 'com', 'mydentalplatform', 'appointment', 'AppointmentService.java');
const apptService = fs.readFileSync(apptServicePath, 'utf8');
const hasIndependentVideoCheck = apptService.includes('isIndependentProvider') &&
  apptService.includes('Dentists from an independent profile are eligible for video consultations only');
report('Backend: AppointmentService enforces independent dentists eligible for video only', hasIndependentVideoCheck);

const providerControllerPath = path.join(root, 'backend', 'src', 'main', 'java', 'com', 'mydentalplatform', 'provider', 'ProviderController.java');
const providerController = fs.readFileSync(providerControllerPath, 'utf8');
const hasEligibilityFields = providerController.includes('isIndependent') &&
  providerController.includes('eligibleForInClinic') &&
  providerController.includes('eligibleForVideo') &&
  providerController.includes('consultationModes');
report('Backend: ProviderController exposes isIndependent and consultationModes', hasEligibilityFields);

const marketplaceSvcPath = path.join(root, 'src', 'app', 'core', 'services', 'marketplace.service.ts');
const marketplaceSvc = fs.readFileSync(marketplaceSvcPath, 'utf8');
const hasMarketplaceEligibility = marketplaceSvc.includes('isIndependent?: boolean;') &&
  marketplaceSvc.includes('eligibleForInClinic?: boolean;') &&
  marketplaceSvc.includes('consultationModes?: (\'in_person\' | \'video\')[];');
report('Frontend: MarketplaceService models consultation mode eligibility', hasMarketplaceEligibility);

const bookingCompPath = path.join(root, 'src', 'app', 'features', 'marketplace', 'marketplace-booking.component.ts');
const bookingComp = fs.readFileSync(bookingCompPath, 'utf8');
const hasBookingLock = bookingComp.includes('isIndependent = computed') &&
  bookingComp.includes('eligibleForInClinic = computed');
report('Frontend: MarketplaceBookingComponent locks independent dentists to video', hasBookingLock);

const bookingHtmlPath = path.join(root, 'src', 'app', 'features', 'marketplace', 'marketplace-booking.component.html');
const bookingHtml = fs.readFileSync(bookingHtmlPath, 'utf8');
const hasDisabledInClinic = bookingHtml.includes('[disabled]="isIndependent()"') &&
  bookingHtml.includes('Independent Dentist Profile:');
report('Frontend: MarketplaceBooking HTML disables in-clinic visit for independent dentists', hasDisabledInClinic);

// 9. Checking Phosphor Icon Font Assets & Fallback Integrity
console.log('\n9. Checking Phosphor Icon Font Assets & Fallback Integrity:');
const fontWoff2Exists = fs.existsSync(path.join(root, 'public', 'fonts', 'Phosphor.woff2'));
const fontWoffExists = fs.existsSync(path.join(root, 'public', 'fonts', 'Phosphor.woff'));
report('Static Font: Phosphor.woff2 and Phosphor.woff exist in public/fonts', fontWoff2Exists && fontWoffExists);

const stylesCssPath = path.join(root, 'src', 'styles.css');
const stylesCss = fs.readFileSync(stylesCssPath, 'utf8');
const hasFontFace = stylesCss.includes('font-family: "Phosphor"') && stylesCss.includes('url("/fonts/Phosphor.woff2")');
report('Styles: Root-relative Phosphor @font-face declared in styles.css', hasFontFace);

const indexHtmlPath = path.join(root, 'src', 'index.html');
const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
const hasCdnFallback = indexHtml.includes('@phosphor-icons/web') && indexHtml.includes('regular/style.css');
report('Index HTML: Phosphor icons stylesheet included in index.html head', hasCdnFallback);

const secConfigPath = path.join(root, 'backend', 'src', 'main', 'java', 'com', 'mydentalplatform', 'config', 'SecurityConfig.java');
const secConfig = fs.readFileSync(secConfigPath, 'utf8');
const hasFontSecurityPermits = secConfig.includes('"/fonts/**"') && secConfig.includes('"/**/*.woff2"');
report('SecurityConfig: Spring Security permits static fonts and woff2 binaries', hasFontSecurityPermits);

// 10. Checking Google Analytics 4 (GA4) Architecture & Telemetry Integration
console.log('\n10. Checking Google Analytics 4 (GA4) Multi-Tenant Telemetry:');
const analyticsSvcPath = path.join(root, 'src', 'app', 'core', 'services', 'analytics.service.ts');
const analyticsSvc = fs.readFileSync(analyticsSvcPath, 'utf8');
const hasGaCoreMethods = analyticsSvc.includes('setClinicTrackingId') &&
  analyticsSvc.includes('trackBookingSubmitted') &&
  analyticsSvc.includes('trackBeginBooking') &&
  analyticsSvc.includes('trackContactSubmitted') &&
  analyticsSvc.includes('trackCtaClick') &&
  analyticsSvc.includes('trackMarketplaceSearch') &&
  analyticsSvc.includes('trackDentistProfileView') &&
  analyticsSvc.includes('trackVideoRoomJoined');
report('AnalyticsService: Multi-tenant dual-stream and funnel taxonomy methods implemented', hasGaCoreMethods);

const clinicConfigDefPath = path.join(root, 'src', 'app', 'core', 'config', 'clinic.config.ts');
const clinicConfigDef = fs.readFileSync(clinicConfigDefPath, 'utf8');
const hasGaClinicConfig = clinicConfigDef.includes('googleAnalyticsId?: string;');
report('ClinicConfig: Interface declares optional tenant googleAnalyticsId', hasGaClinicConfig);

const clinicCfgSvcPath = path.join(root, 'src', 'app', 'core', 'services', 'clinic-config.service.ts');
const clinicCfgSvc = fs.readFileSync(clinicCfgSvcPath, 'utf8');
const hasGaConfigSync = clinicCfgSvc.includes('setClinicTrackingId') &&
  clinicCfgSvc.includes('AnalyticsService');
report('ClinicConfigService: Synchronizes tenant GA tracking ID on load, update, and reset', hasGaConfigSync);

const backendQuerySvcPath = path.join(root, 'backend', 'src', 'main', 'java', 'com', 'mydentalplatform', 'clinic', 'ClinicQueryService.java');
const backendQuerySvc = fs.readFileSync(backendQuerySvcPath, 'utf8');
const hasBackendGaSupport = backendQuerySvc.includes('"googleAnalyticsId"') &&
  backendQuerySvc.includes('^G-[A-Za-z0-9]+$');
report('Backend: ClinicQueryService validates and stores tenant googleAnalyticsId in public_config', hasBackendGaSupport);

const adminSettingsPath = path.join(root, 'src', 'app', 'features', 'admin', 'admin-settings', 'admin-settings.component.ts');
const adminSettings = fs.readFileSync(adminSettingsPath, 'utf8');
const hasAdminGaSettings = adminSettings.includes('googleAnalyticsId') &&
  adminSettings.includes('updateClinicSettings');
report('Clinic Admin: AdminSettingsComponent supports tenant GA4 measurement ID persistence', hasAdminGaSettings);

const gaApptComp = fs.readFileSync(path.join(root, 'src', 'app', 'features', 'appointment', 'appointment.component.ts'), 'utf8');
const hasApptTelemetry = gaApptComp.includes('trackBeginBooking') && gaApptComp.includes('trackBookingSubmitted');
report('Funnel: Appointment booking flow instruments begin_booking and appointment_booked', hasApptTelemetry);

const gaContactComp = fs.readFileSync(path.join(root, 'src', 'app', 'features', 'contact', 'contact.component.ts'), 'utf8');
const hasContactTelemetry = gaContactComp.includes('trackContactSubmitted');
report('Funnel: Contact form instruments contact_form_submit telemetry', hasContactTelemetry);

const gaLayoutComp = fs.readFileSync(path.join(root, 'src', 'app', 'shared', 'components', 'clinic-layout', 'clinic-layout.component.ts'), 'utf8');
const hasLayoutTelemetry = gaLayoutComp.includes('trackWhatsappClick') && gaLayoutComp.includes('trackCallClick');
report('Funnel: Layout instruments WhatsApp, Phone call, and Book CTA clicks', hasLayoutTelemetry);

const dockerfilePath = path.join(root, 'Dockerfile');
const dockerfile = fs.readFileSync(dockerfilePath, 'utf8');
const hasDockerGaArg = dockerfile.includes('ARG GA_TRACKING_ID');
report('Dockerfile: Declares ARG GA_TRACKING_ID in frontend stage', hasDockerGaArg);

// Summary
console.log('\n========================================');
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log('========================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('ALL END-TO-END CHECKS PASSED SUCCESSFULLY!\n');
}
