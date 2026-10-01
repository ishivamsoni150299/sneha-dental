package com.mydentalplatform.marketplace;

import java.nio.file.Files;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.DefaultResourceLoader;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ClinicProfilePageControllerTest {
    @Test
    void rendersVerifiedPublicFactsAndEscapesSubmittedClinicContent() throws Exception {
        var folder = Files.createTempDirectory("clinic-page-"); var index = folder.resolve("index.html");
        Files.writeString(index, "<!doctype html><html><head><title>Generic</title><meta name=\"description\" content=\"Wrong clinic\"></head><body><app-root></app-root></body></html>");
        try {
            var marketplace = mock(MarketplaceApiService.class);
            var summary = new MarketplaceApiService.DentistSummary(UUID.randomUUID(), "test-clinic", "Clinic <script>alert(1)</script>", "Dentist", "Noida", "Noida", List.of(), List.of(), 500, true, null, null, null, 0, null);
            when(marketplace.detail("test-clinic")).thenReturn(Optional.of(new MarketplaceApiService.DentistDetail(summary, "BDS", "", "", "", "Noida", List.of(), List.of(), List.of(), List.of())));
            var controller = new ClinicProfilePageController(marketplace, new DefaultResourceLoader(), new String[]{folder.toUri().toString()}, "https://mydentalplatform.com");
            var response = controller.clinic("test-clinic");
            assertEquals(200, response.getStatusCode().value());
            String html = response.getBody();
            assertTrue(html.contains("&lt;script&gt;")); assertFalse(html.contains("<script>"));
            assertTrue(html.contains("Consultation fee: ₹500"));
            assertTrue(html.contains("href=\"/dentists/test-clinic/book\""));
            assertTrue(html.contains("https://mydentalplatform.com/clinic/test-clinic"));
            assertFalse(html.contains("Wrong clinic"));
        } finally { Files.delete(index); Files.delete(folder); }
    }
    @Test
    void unpublishedProfileIsNotIndexedOrRenderedAsVerified() throws Exception {
        var marketplace = mock(MarketplaceApiService.class); when(marketplace.detail("hidden")).thenReturn(Optional.empty());
        var controller = new ClinicProfilePageController(marketplace, new DefaultResourceLoader(), new String[]{"classpath:/static/"}, "https://mydentalplatform.com");
        var response = controller.clinic("hidden");
        assertEquals(404, response.getStatusCode().value()); assertEquals("noindex", response.getHeaders().getFirst("X-Robots-Tag"));
        assertFalse(response.getBody().contains("Book Appointment"));
    }
}
