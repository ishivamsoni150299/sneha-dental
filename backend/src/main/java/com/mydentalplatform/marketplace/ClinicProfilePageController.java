package com.mydentalplatform.marketplace;
import java.util.*;
import org.springframework.http.*;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import com.mydentalplatform.clinic.ClinicQueryService;
import com.mydentalplatform.provider.PublicProviderService;
import static com.mydentalplatform.marketplace.ProfileHtmlRenderer.escape;

@Controller
public class ClinicProfilePageController {
    private final MarketplaceApiService marketplace;
    private final ClinicQueryService clinics;
    private final PublicProviderService providers;
    private final ProfileHtmlRenderer html;
    public ClinicProfilePageController(MarketplaceApiService marketplace, ClinicQueryService clinics,
        PublicProviderService providers, ProfileHtmlRenderer html) {
        this.marketplace = marketplace; this.clinics = clinics; this.providers = providers; this.html = html;
    }
    @GetMapping(value = "/clinic/{slug:[a-z0-9-]+}", produces = MediaType.TEXT_HTML_VALUE)
    @ResponseBody
    public ResponseEntity<String> clinic(@PathVariable String slug) throws Exception {
        if (clinics.findPublishedClinicBySlug(slug).isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        var details = marketplace.detail(slug).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        var clinic = details.dentist();
        String path = "/clinic/" + slug;
        String title = clinic.clinicName() + " — Dental Clinic" + (clinic.city().isBlank() ? "" : " in " + clinic.city()) + " | My Dental Platform";
        String description = "View " + clinic.clinicName() + ", verified dentists, published consultation fees, address and appointment availability.";
        StringBuilder summary = new StringBuilder("<main><nav aria-label=\"Breadcrumb\"><a href=\"/dentists\">Dentists</a></nav><h1>" + escape(clinic.clinicName())
            + "</h1><p>Verified marketplace clinic</p><h2>" + escape(clinic.dentistName()) + "</h2><p>" + escape(details.qualification())
            + "</p><p>" + escape(details.address()) + "</p><p>Consultation fee: " + (clinic.consultationFee() == null ? "Contact the clinic" : "₹" + clinic.consultationFee())
            + "</p><p>Appointment requests require clinic confirmation.</p><h2>Dentists at this clinic</h2>");
        for (var dentist : providers.clinicDentists(clinic.id())) summary.append("<a href=\"/dentist/").append(escape(dentist.get("slug"))).append("\">").append(escape(dentist.get("name"))).append("</a>");
        if (clinic.acceptingNewPatients()) summary.append("<a href=\"/dentists/").append(escape(slug)).append("/book\">Request appointment</a>");
        summary.append("<h2>Dental services</h2><ul>");
        for (String service : clinic.serviceIds()) summary.append("<li>").append(escape(marketplace.serviceLabel(service))).append("</li>");
        summary.append("</ul>");
        if (!clinic.languages().isEmpty()) summary.append("<h2>Languages</h2><p>").append(escape(String.join(", ", clinic.languages()))).append("</p>");
        summary.append("</main>");
        Map<String, Object> entity = new LinkedHashMap<>(Map.of("@type", "Dentist", "@id", html.url(path) + "#clinic", "name", clinic.clinicName(), "url", html.url(path)));
        if (!details.address().isBlank()) entity.put("address", Map.of("@type", "PostalAddress", "streetAddress", details.address(), "addressLocality", clinic.city(), "addressCountry", "IN"));
        if (!details.phone().isBlank()) entity.put("telephone", details.phone());
        if (clinic.imageUrl() != null && !clinic.imageUrl().isBlank()) entity.put("image", html.imageUrl(clinic.imageUrl()));
        return ResponseEntity.ok().cacheControl(CacheControl.noCache()).body(html.render(title, description, path, clinic.imageUrl(), summary.toString(), List.of(entity,
            Map.of("@type", "WebPage", "@id", html.url(path) + "#page", "url", html.url(path), "name", title, "mainEntity", Map.of("@id", html.url(path) + "#clinic")))));
    }
    @GetMapping(value = "/dentists/{slug:[a-z0-9-]+}", produces = MediaType.TEXT_HTML_VALUE)
    @ResponseBody
    public ResponseEntity<Void> legacy(@PathVariable String slug) {
        String path;
        if (clinics.findPublishedClinicBySlug(slug).isPresent()) path = "/clinic/" + slug;
        else { providers.profile(slug); path = "/dentist/" + slug; }
        return ResponseEntity.status(HttpStatus.PERMANENT_REDIRECT).header("Location", html.url(path)).cacheControl(CacheControl.noCache()).build();
    }
    @GetMapping("/api/marketplace/clinics/{slug}/dentists")
    @ResponseBody
    public List<Map<String, Object>> team(@PathVariable String slug) {
        var clinic = clinics.findPublishedClinicBySlug(slug).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        return providers.clinicDentists(UUID.fromString(clinic.get("id").toString()));
    }
    @ExceptionHandler(Exception.class)
    @ResponseBody
    ResponseEntity<String> unavailable(Exception error) {
        int status = error instanceof ResponseStatusException response && response.getStatusCode().value() == 404 ? 404 : 503;
        return ResponseEntity.status(status).header("X-Robots-Tag", "noindex").cacheControl(CacheControl.noStore())
            .body("<!doctype html><html lang=\"en\"><title>Clinic unavailable</title><body><h1>Clinic unavailable</h1><a href=\"/dentists\">Find a dentist</a></body></html>");
    }
}
