package com.mydentalplatform.marketplace;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ResourceLoader;
import org.springframework.http.*;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.util.HtmlUtils;

/** A public, escaped clinic summary is available before JavaScript loads. */
@Controller
public class ClinicProfilePageController {
    private final MarketplaceApiService marketplace;
    private final ResourceLoader resources;
    private final String[] locations;
    private final String publicUrl;
    public ClinicProfilePageController(MarketplaceApiService marketplace, ResourceLoader resources,
        @Value("${spring.web.resources.static-locations:classpath:/static/}") String[] locations,
        @Value("${platform.public-base-url}") String publicUrl) {
        this.marketplace = marketplace; this.resources = resources; this.locations = locations; this.publicUrl = publicUrl;
    }
    @GetMapping(value = "/clinic/{slug:[a-z0-9-]+}", produces = MediaType.TEXT_HTML_VALUE)
    @ResponseBody
    public ResponseEntity<String> clinic(@PathVariable String slug) throws IOException {
        var profile = marketplace.detail(slug);
        if (profile.isEmpty()) return ResponseEntity.status(HttpStatus.NOT_FOUND).header("X-Robots-Tag", "noindex")
            .body("<!doctype html><html lang=\"en\"><title>Clinic unavailable | My Dental Platform</title><body><h1>Clinic unavailable</h1><p>This clinic is not currently published.</p><a href=\"/dentists\">Find a dentist</a></body></html>");
        var details = profile.get(); var clinic = details.dentist();
        String title = escape(clinic.clinicName() + " in " + clinic.city() + " | My Dental Platform");
        String summary = "<main class=\"ui-card\"><h1>" + escape(clinic.clinicName()) + "</h1><p>Verified marketplace clinic</p><h2>" + escape(clinic.dentistName())
            + "</h2><p>" + escape(details.qualification()) + "</p><p>" + escape(details.address()) + "</p><p>Consultation fee: "
            + (clinic.consultationFee() == null ? "Contact the clinic" : "₹" + clinic.consultationFee()) + "</p><p>" + (clinic.acceptingNewPatients() ? "Appointment requests require clinic confirmation." : "Not accepting new patients.")
            + "</p>" + (clinic.acceptingNewPatients() ? "<a href=\"/dentists/" + escape(slug) + "/book\">Book Appointment</a>" : "<a href=\"/dentists\">Find another dentist</a>") + "</main>";
        String html = resources.getResource(locations[0] + "index.html").getContentAsString(StandardCharsets.UTF_8)
            .replaceFirst("(?s)<title>.*?</title>", Matcher.quoteReplacement("<title>" + title + "</title>"))
            .replaceFirst("(?s)<app-root[^>]*>.*?</app-root>", Matcher.quoteReplacement("<app-root>" + summary + "</app-root>"));
        // Generic shell metadata must not describe the tenant brochure or another route.
        html = html.replaceAll("<meta[^>]+(?:name|property)=\"(?:description|og:title|og:description|og:url|twitter:title|twitter:description)\"[^>]*>", "")
            .replaceAll("<link[^>]+rel=\"canonical\"[^>]*>", "");
        String description = escape("View " + clinic.clinicName() + " in " + clinic.city() + ". Compare published consultation fees and request an appointment with a verified clinic.");
        html = html.replace("</head>", "<meta name=\"description\" content=\"" + description + "\"><meta property=\"og:title\" content=\"" + title + "\"><link rel=\"canonical\" href=\"" + escape(publicUrl.replaceAll("/+$", "") + "/clinic/" + slug) + "\"></head>");
        return ResponseEntity.ok().cacheControl(CacheControl.noCache()).body(html);
    }
    private String escape(String value) { return HtmlUtils.htmlEscape(value == null ? "" : value); }
}
