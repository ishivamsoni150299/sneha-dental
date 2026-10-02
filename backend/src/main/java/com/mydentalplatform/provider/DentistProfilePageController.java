package com.mydentalplatform.provider;

import java.util.*;
import org.springframework.http.*;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import com.mydentalplatform.marketplace.ProfileHtmlRenderer;
import com.mydentalplatform.marketplace.MarketplaceApiService;
import static com.mydentalplatform.marketplace.ProfileHtmlRenderer.escape;

@Controller
public class DentistProfilePageController {
    private final PublicProviderService providers;
    private final ProfileHtmlRenderer html;
    private final MarketplaceApiService marketplace;
    public DentistProfilePageController(PublicProviderService providers, ProfileHtmlRenderer html, MarketplaceApiService marketplace) {
        this.providers = providers; this.html = html; this.marketplace = marketplace;
    }
    @GetMapping(value = "/dentist/{slug:[a-z0-9-]+}", produces = MediaType.TEXT_HTML_VALUE)
    @ResponseBody
    public ResponseEntity<String> dentist(@PathVariable String slug) throws Exception {
        var profile = providers.profile(slug);
        String path = "/dentist/" + profile.get("slug");
        String name = Objects.toString(profile.get("fullName"), "");
        var locations = locations(profile);
        String city = locations.isEmpty() ? "" : Objects.toString(locations.getFirst().get("city"), "");
        String title = name + ", Dentist" + (city.isBlank() ? "" : " in " + city) + " | My Dental Platform";
        String description = "View " + name + ", qualifications, treatments, practice locations and consultation fees. Appointment requests require confirmation.";
        StringBuilder summary = new StringBuilder("<main><nav aria-label=\"Breadcrumb\"><a href=\"/dentists\">Dentists</a></nav><h1>" + escape(name)
            + "</h1><p>Verified dentist</p><p>" + escape(profile.get("qualification")) + "</p><p>" + escape(profile.get("speciality"))
            + "</p><p>" + escape(profile.get("biography")) + "</p>");
        if (profile.get("experienceYears") != null) summary.append("<p>").append(escape(profile.get("experienceYears"))).append(" years of experience</p>");
        summary.append("<h2>Dental services</h2><ul>");
        for (Object service : (List<?>) profile.getOrDefault("services", List.of())) summary.append("<li>").append(escape(marketplace.serviceLabel(service.toString()))).append("</li>");
        summary.append("</ul>");
        var languages = (List<?>) profile.getOrDefault("languages", List.of());
        if (!languages.isEmpty()) summary.append("<h2>Languages</h2><p>").append(escape(String.join(", ", languages.stream().map(Object::toString).toList()))).append("</p>");
        summary.append("<h2>Practice locations</h2>");
        var affiliations = new ArrayList<Map<String, Object>>();
        for (var location : locations) {
            String clinicSlug = Objects.toString(location.get("clinicSlug"), "");
            summary.append("<section><h3>").append(escape(location.get("name"))).append("</h3><p>")
                .append(escape(location.get("addressLine1"))).append(" ").append(escape(location.get("locality"))).append(" ").append(escape(location.get("city"))).append("</p>");
            if (location.get("consultationFee") != null) summary.append("<p>Consultation fee: ₹").append(escape(location.get("consultationFee"))).append("</p>");
            if (!clinicSlug.isBlank()) {
                summary.append("<a href=\"/clinic/").append(escape(clinicSlug)).append("\">View clinic</a>");
                affiliations.add(Map.of("@type", "Dentist", "@id", html.url("/clinic/" + clinicSlug) + "#clinic", "name", Objects.toString(location.get("name"), ""), "url", html.url("/clinic/" + clinicSlug)));
            }
            if (Boolean.TRUE.equals(location.get("acceptingNewPatients")) && (!clinicSlug.isBlank() || Boolean.TRUE.equals(profile.get("isIndependent")))) {
                String bookingSlug = clinicSlug.isBlank() ? slug : clinicSlug;
                summary.append("<a href=\"/dentists/").append(escape(bookingSlug)).append("/book\">Request appointment</a>");
            }
            summary.append("</section>");
        }
        summary.append("</main>");
        Map<String, Object> person = new LinkedHashMap<>(Map.of("@type", "Person", "@id", html.url(path) + "#person", "name", name, "url", html.url(path)));
        if (!affiliations.isEmpty()) person.put("affiliation", affiliations);
        if (profile.get("photoUrl") != null && !profile.get("photoUrl").toString().isBlank()) person.put("image", html.imageUrl(profile.get("photoUrl").toString()));
        return ResponseEntity.ok().cacheControl(CacheControl.noCache()).body(html.render(title, description, path,
            Objects.toString(profile.get("photoUrl"), ""), summary.toString(), List.of(person,
                Map.of("@type", "WebPage", "@id", html.url(path) + "#page", "url", html.url(path), "name", title, "mainEntity", Map.of("@id", html.url(path) + "#person")))));
    }
    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> locations(Map<String, Object> profile) { return (List<Map<String, Object>>) profile.getOrDefault("practiceLocations", List.of()); }
    @ExceptionHandler(Exception.class)
    @ResponseBody
    ResponseEntity<String> unavailable(Exception error) {
        int status = error instanceof ResponseStatusException response && response.getStatusCode().value() == 404 ? 404 : 503;
        return ResponseEntity.status(status).header("X-Robots-Tag", "noindex").cacheControl(CacheControl.noStore())
            .body("<!doctype html><html lang=\"en\"><title>Dentist unavailable</title><body><h1>Dentist unavailable</h1><a href=\"/dentists\">Find a dentist</a></body></html>");
    }
}
