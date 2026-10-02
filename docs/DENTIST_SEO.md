# Dentist and clinic search visibility

Status: implemented in the repository, 2026-10-02. Deployment routing and search-engine indexing remain external verification steps. This migration uses the existing public profile screen and Spring Boot application shell.

## Implementation delivered

- Shared provider-domain public projection for the API, initial HTML, clinic team links, and live sitemap queries. All use active/verified/published providers with active memberships and locations.
- `/dentist/{slug}` renders a dentist identity with all published practices; `/clinic/{slug}` resolves a real verified clinic. Their initial HTML contains escaped public facts, canonical/social metadata, Person or Dentist entity markup, and breadcrumbs. Angular maintains the same identities and metadata through navigation.
- `/dentists/{slug}` permanently redirects to the published clinic or dentist. Existing locality routes take precedence. Directory clinic cards link to the clinic namespace; clinic teams and dentist practice cards link to their published counterparts.
- `/sitemap.xml` indexes `/sitemap-pages.xml` and live `/sitemap-profiles/{page}.xml` files, at 10,000 canonical profiles per file, across all regions. Duplicate locations produce one dentist URL. Booking/account/alias URLs and fabricated last-modified dates are excluded.
- Unavailable profiles return 404/noindex; rendering or storage failures return 503/noindex. Responses revalidate rather than persist revoked publication in a long-lived cache. Dentist pages do not borrow clinic-wide reviews or compatibility opening hours.

Verification: 49 focused Angular profile/service/SEO/directory/booking tests and eight backend tests passed, including HTML/redirect/XML tests and the real HTTP/security/PostgreSQL stack with 60 dentists, two cities, multiple locations, namespace collisions, private-field exclusion, and visibility revocation. Sitemap unit tests cover splitting beyond 10,000 entries. Production deployment, Search Console submission, rich-result eligibility, and actual indexing/ranking are not established by these tests.

Responsive browser verification against the compiled application, using an intercepted public API fixture, passed at 1440px and 390px: dentist H1 and practice cards, clinic/team links, canonical and Person/Dentist markup through navigation, keyboard focus, no horizontal overflow, and no uncaught page errors. This does not verify real production data or appointment submission. Final lint, production build, and compiled-artifact checks passed.

## Outcome

A search for a listed dentist's name, clinic name, or either name plus locality should have a useful, crawlable MyDentalPlatform page to discover. Search engines decide indexing and rankings; the platform must not promise first position. Each verified, published dentist has an identity page, and each verified clinic has a separate clinic page. Both use accurate public facts and link to the real practice relationship.

## Findings before this migration

- Existing routes are `/dentist/:slug`, `/clinic/:slug`, and the older `/dentists/:slug`. All three use `DentistProfileComponent`.
- `ClinicProfilePageController` renders a public HTML summary only for `/clinic/{slug}`. Dentist identity pages need equivalent initial HTML; metadata updated after JavaScript is not the entire crawlability solution.
- `public/sitemap.xml` is static. It does not automatically discover newly published dentists and clinics, and its fixed last-modified values should not be copied onto live profiles.
- `DentistProfileComponent` updates title and description after loading; `SeoService` otherwise uses generic route metadata and directory markup. Canonical, social metadata, robots directives, and entity markup need one profile-aware owner and consistent server/client results.
- `MarketplaceService.getVerifiedProviderBySlug()` redirects a clinic-affiliated provider's data lookup to the clinic listing. This loses the selected dentist's identity. Its independent-provider compatibility DTO should not become the SEO identity model.
- `ClinicQueryService.findIndependentProviderBySlug()` produces a clinic-compatible DTO and defaults some location/hours information. Never copy those defaults into identity structured data as actual business facts.
- `ProviderController.publicProfile()` already filters active, verified providers with published listings and active memberships/locations. Reuse this domain's visibility rules through a service; do not invoke a controller from another controller or duplicate SQL filters across renderers and sitemaps.

## URL and entity ownership

| Entity | Canonical route | Main content |
| --- | --- | --- |
| Dentist | `/dentist/{existing-provider-slug}` | Dentist identity, qualifications, published biography, treatments, real practice locations |
| Clinic | `/clinic/{existing-marketplace-slug}` | Clinic name, public address/contact details, verified dentists, treatments, request action |
| Old listing | `/dentists/{existing-slug}` | Permanent redirect to the matching canonical entity after resolving its public identity |
| Booking | `/dentists/{booking-slug}/book` | Existing guarded/request journey; noindex, excluded from sitemap |

Keep existing stable slugs. Do not rename all URLs for keywords. Use the database identity to distinguish dentists with the same name; the slug is a public identifier, not the identity key. A name edit does not change the URL. A future explicit slug change requires a persisted old-to-new redirect; do not add a slug-history migration until that workflow exists. Resolve route namespace collisions explicitly: a provider slug and clinic slug may match without representing the same entity.

An affiliated dentist page remains about that dentist, even if appointments use a clinic booking slug. Its action opens the existing clinic request journey; a doctor is selected within that journey. Existing availability slot links can carry doctor/date/time together. A doctor-only query does not currently preselect the booking screen. An independent dentist is not represented as a physical clinic. Multiple practice locations belong to the same dentist identity page.

## Page structure using the existing profile screen

Dentist page, in order:

1. Breadcrumb: Dentists → dentist's public name.
2. H1: dentist's name. Qualification and speciality immediately below; verification state derived from actual approval.
3. Short published biography and actual experience, when provided. Do not generate claims about success rates or expertise.
4. Practice cards: clinic/location name, locality/city, public address, location-specific fee, and link to the published clinic page. Show multiple active public locations accurately.
5. Treatments actually offered and languages actually published.
6. Relevant published reviews only when their attribution matches the dentist. Clinic-wide reviews must be labelled as clinic reviews, not reassigned to an individual dentist.
7. Existing appointment-request action, with confirmation requirements visible.

Clinic page retains its clinic H1, address, contact details, fees, hours, and appointment request. Its verified team links to each published dentist's identity page. Add ordinary HTML links from existing directory cards and profile pages, so discovery does not depend solely on a sitemap or button click handlers.

Keep Instrument Sans, existing semantic tokens, shared cards, mobile layout, and existing permission boundaries. A public profile is not the authenticated professional workspace.

## Search metadata

Illustrative values below are placeholders, never seed production listings:

- Dentist title: `Dr. [Name], Dentist in [Locality, City] | MyDentalPlatform`.
- Clinic title: `[Clinic Name] — Dental Clinic in [Locality, City] | MyDentalPlatform`.
- Dentist description: `[Name], [published qualification], practises at [published clinic] in [location]. View treatments, consultation fees, and request an appointment.`
- Clinic description: `View [Clinic Name] in [location], its verified dentists, published fees, address, and appointment availability.`

Omit missing facts cleanly. Online-only dentists should say online consultation, without an invented local practice address. Every valid public page gets one absolute self-canonical on `https://mydentalplatform.com`, matching `og:url`; campaign and filter parameters do not create new canonical pages. Use the real public photo when available, otherwise the platform fallback. Set title, description, Open Graph, Twitter, and robots consistently before and after Angular loads. Do not append the brand twice.

Use initial server HTML for all visitors, including crawlers. It must contain the same identity, practice facts, links, and metadata that Angular displays. Reuse Spring Boot's existing static Angular shell/rendering approach for this migration; no bot-specific rendering or separate SEO framework. Escape user text and HTML attributes; serialize JSON safely so submitted `</script>` text cannot break out of a JSON-LD block. Keep the canonical origin configured, not derived from an untrusted Host header.

## Structured data

Use an entity graph with stable IDs:

- Dentist: `Person` at `{dentist-canonical}#person`, with public name, URL, genuine image, qualification/credentials where supported, and known affiliations. Use `affiliation` for practice membership unless employment is actually established; do not infer `worksFor` from visiting privileges.
- Dentist page: `WebPage` with `mainEntity` pointing to the person. Consider `ProfilePage` only after checking Google's specific eligibility rules; it is not a guaranteed directory rich result.
- Clinic: `Dentist` (the Schema.org local business type) at `{clinic-canonical}#clinic`, with true public name, URL, address, phone, and actual opening hours. A person is not this business entity.
- BreadcrumbList mirrors visible breadcrumbs.
- Reviews/aggregateRating may be added only when visible, genuine, published, correctly attributed, and eligible under the relevant search guidance. Start without rating markup where attribution is unclear.

Do not mark verification as a rating, invent `sameAs` URLs, infer employment, or expose private provider phone numbers. Do not emit local-business hours for online-only providers from compatibility defaults. Remove generic directory/FAQ schema from individual profiles when replacing it with entity-specific markup.

## Live discovery and lifecycle

Serve `/sitemap.xml` as an index of the existing indexable platform pages plus generated profile sitemap sections. Generate profile entries from the same public projection used for page rendering, across all supported regions. Include all eligible providers, not only the first 50 API results, and deduplicate providers with multiple locations.

Only include active, verified, published profiles and verified public clinics. Exclude demos, drafts, suspended entities, booking URLs, account pages, filters, unavailable profiles, and redirect aliases. Use actual content-modification timestamps or omit `lastmod`; appointment-slot changes need not change an identity page timestamp. XML-escape URLs and split files at sitemap protocol limits. Keep robots.txt's sitemap reference correct and security rules limited to public GET routes. Do not expose authenticated records through the sitemap query.

| Lifecycle | Public HTML | Sitemap |
| --- | --- | --- |
| Verified and published | 200, indexable, canonical entity content | Included |
| Draft/unverified/unpublished | 404 with noindex; no public identity details | Excluded |
| Temporarily inaccessible due to API/storage failure | 503, noindex; never a generic 200 profile | No fabricated replacement entries |
| Existing alias | Permanent redirect to valid canonical entity | Canonical URL only |
| Renamed dentist, same identity | Same URL, updated name/content | Same URL |

Do not cache revoked publication indefinitely. Public HTML and sitemap caches must respect publication updates. Define cache invalidation with the existing publication workflow before adding persistent caches.

## Delivery sequence and acceptance

1. **Identity correctness:** extract the provider's existing public projection into a provider-domain service. Preserve provider identity and all eligible locations on `/dentist/:slug`; keep clinic pages distinct. Test published/unpublished, affiliated/independent, matching slugs, multiple locations, and private-field exclusion.
2. **Crawlable pages:** extend existing public HTML rendering to dentist identity pages, share metadata/entity construction within each domain, and make Angular match that content. Test initial HTML with JavaScript disabled, correct H1/title/canonical/social tags, real affiliations, safe escaping, robots states, errors, and alias redirects. Test client navigation so prior profile metadata is removed.
3. **Discovery:** generate live profile sitemaps and connect existing directory/team/location links. Test pagination beyond 50 entries, deduplication, all supported regions, visibility revocation, XML validity, and canonical-only URLs. Confirm deployment routing serves these requests through Spring Boot rather than a CDN/static SPA fallback.
4. **Launch measurement:** run relevant Java integration tests, Angular tests/lint/build, desktop/mobile and keyboard checks against an isolated API/database. Inspect deployed HTML, submit sitemap in the domain owner's Search Console, use URL Inspection and Rich Results Test for representative pages, and track actual indexing. Search Console access and submission are external follow-up work, not completed by writing this document.

Measure published eligible profiles versus sitemap coverage, correct 200/canonical responses, indexed canonical profiles, branded name-query impressions/clicks, and appointment requests from organic sessions. Review indexing issues before expanding locality pages. Use real Search Console data; do not promise an indexing deadline or a ranking increase percentage.

Clinic owners can independently maintain an eligible verified Google Business Profile with consistent real-world name, address, contact details, hours, and a link to their preferred official page. This supports local discovery but is a separate surface from organic MyDentalPlatform pages. The platform must not automatically create, claim, or edit these business profiles.

## Primary references

- [Google canonical URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Google sitemap construction and submission](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Google local business structured data](https://developers.google.com/search/docs/appearance/structured-data/local-business)
- [Google ProfilePage eligibility](https://developers.google.com/search/docs/appearance/structured-data/profile-page)
- [Google local ranking factors](https://support.google.com/business/answer/7091)
- [Schema.org Person](https://schema.org/Person)
