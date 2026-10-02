package com.mydentalplatform.marketplace;

import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.DefaultResourceLoader;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import com.mydentalplatform.clinic.ClinicQueryService;
import com.mydentalplatform.provider.*;
import tools.jackson.databind.ObjectMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

class ClinicProfilePageControllerTest {
    @TempDir Path folder;
    private final ClinicQueryService clinics = mock(ClinicQueryService.class);
    private final PublicProviderService providers = mock(PublicProviderService.class);
    private final MarketplaceApiService marketplace = mock(MarketplaceApiService.class);
    private ProfileHtmlRenderer renderer() throws Exception {
        Files.writeString(folder.resolve("index.html"), "<!doctype html><html><head><title>Generic</title><meta name=\"description\" content=\"Wrong clinic\"><link rel=\"canonical\" href=\"https://wrong.test\"><script type=\"application/ld+json\">{\"@type\":\"FAQPage\"}</script></head><body><app-root></app-root><script src=\"main.js\"></script></body></html>");
        return new ProfileHtmlRenderer(new DefaultResourceLoader(), new String[]{folder.toUri().toString()}, "https://mydentalplatform.com", new ObjectMapper());
    }
    private ClinicProfilePageController controller() throws Exception {
        return new ClinicProfilePageController(marketplace, clinics, providers, renderer());
    }
    @Test void rendersVerifiedPublicFactsAndEscapesSubmittedClinicContent() throws Exception {
        var id = UUID.randomUUID();
        when(clinics.findPublishedClinicBySlug("test-clinic")).thenReturn(Optional.of(Map.of("id", id)));
        var summary = new MarketplaceApiService.DentistSummary(id, "test-clinic", "Clinic <script>alert(1)</script>", "Dentist", "Noida", "Noida", List.of(), List.of(), 500, true, null, null, null, 0, null);
        when(marketplace.detail("test-clinic")).thenReturn(Optional.of(new MarketplaceApiService.DentistDetail(summary, "BDS", "", "", "", "Noida", List.of(), List.of(), List.of(), List.of())));
        when(providers.clinicDentists(id)).thenReturn(List.of(Map.of("name", "Dr Asha", "slug", "asha")));
        var response = controller().clinic("test-clinic");
        assertEquals(200, response.getStatusCode().value());
        String html = response.getBody();
        assertTrue(html.contains("&lt;script&gt;")); assertFalse(html.contains("<script>alert"));
        assertTrue(html.contains("\\u003cscript\\u003e"));
        assertTrue(html.contains("Consultation fee: ₹500"));
        assertTrue(html.contains("href=\"/dentists/test-clinic/book\""));
        assertTrue(html.contains("href=\"/dentist/asha\""));
        assertTrue(html.contains("https://mydentalplatform.com/clinic/test-clinic"));
        assertFalse(html.contains("Wrong clinic")); assertFalse(html.contains("FAQPage"));
        assertTrue(html.contains("src=\"main.js\""));
        assertEquals(1, html.split("rel=\"canonical\"").length - 1);
    }
    @Test void unpublishedOrFailedProfilesHaveHonestStatusAndNoPublicFacts() throws Exception {
        var mvc = MockMvcBuilders.standaloneSetup(controller()).build();
        var missing = mvc.perform(get("/clinic/hidden")).andReturn().getResponse();
        assertEquals(404, missing.getStatus()); assertEquals("noindex", missing.getHeader("X-Robots-Tag"));
        when(clinics.findPublishedClinicBySlug("failed")).thenThrow(new IllegalStateException("private database detail"));
        var failed = mvc.perform(get("/clinic/failed")).andReturn().getResponse();
        assertEquals(503, failed.getStatus()); assertEquals("noindex", failed.getHeader("X-Robots-Tag"));
        assertFalse(failed.getContentAsString().contains("private database"));
    }
    @Test void resolvesNamespaceCollisionAndRedirectsOnlyPublishedAliases() throws Exception {
        when(clinics.findPublishedClinicBySlug("same")).thenReturn(Optional.of(Map.of("id", UUID.randomUUID())));
        assertEquals("https://mydentalplatform.com/clinic/same", controller().legacy("same").getHeaders().getFirst("Location"));
        verify(providers, never()).profile("same");
        when(providers.profile("person")).thenReturn(Map.of("slug", "person"));
        assertEquals(308, controller().legacy("person").getStatusCode().value());
        assertEquals("https://mydentalplatform.com/dentist/person", controller().legacy("person").getHeaders().getFirst("Location"));
        when(providers.profile("hidden")).thenThrow(new ResponseStatusException(HttpStatus.NOT_FOUND));
        var mvc = MockMvcBuilders.standaloneSetup(controller()).build();
        assertEquals(404, mvc.perform(get("/dentists/hidden")).andReturn().getResponse().getStatus());
    }
    @Test void dentistPageRetainsPersonAndMultiplePublicPractices() throws Exception {
        when(providers.profile("asha")).thenReturn(Map.of(
            "slug", "asha", "fullName", "Dr Asha", "qualification", "BDS", "biography", "</script><script>alert(2)</script>",
            "isIndependent", false, "practiceLocations", List.of(
                Map.of("name", "Delhi Practice", "clinicSlug", "delhi-clinic", "city", "Delhi", "addressLine1", "Main Road", "consultationFee", 500, "acceptingNewPatients", true),
                Map.of("name", "Pune Practice", "city", "Pune", "acceptingNewPatients", true))));
        var page = new DentistProfilePageController(providers, renderer(), marketplace).dentist("asha").getBody();
        assertTrue(page.contains("<h1>Dr Asha</h1>")); assertTrue(page.contains("Pune Practice"));
        assertTrue(page.contains("\"@type\":\"Person\"")); assertTrue(page.contains("\"affiliation\""));
        assertFalse(page.contains("\"worksFor\"")); assertFalse(page.contains("alert(2)</script>"));
        assertTrue(page.contains("href=\"/clinic/delhi-clinic\""));
        assertTrue(page.contains("href=\"/dentists/delhi-clinic/book\""));
        assertFalse(page.contains("href=\"/dentists/asha/book\""));
        assertTrue(page.contains("BreadcrumbList"));
    }
    @Test void missingDentistOrShellNeverReturnsGenericIndexableSuccess() throws Exception {
        when(providers.profile("hidden")).thenThrow(new ResponseStatusException(HttpStatus.NOT_FOUND));
        var html = renderer();
        var mvc = MockMvcBuilders.standaloneSetup(new DentistProfilePageController(providers, html, marketplace)).build();
        assertEquals(404, mvc.perform(get("/dentist/hidden")).andReturn().getResponse().getStatus());
        when(providers.profile("published")).thenReturn(Map.of("slug", "published", "fullName", "Published Dentist"));
        Files.delete(folder.resolve("index.html"));
        var response = mvc.perform(get("/dentist/published")).andReturn().getResponse();
        assertEquals(503, response.getStatus()); assertEquals("noindex", response.getHeader("X-Robots-Tag"));
    }
}
