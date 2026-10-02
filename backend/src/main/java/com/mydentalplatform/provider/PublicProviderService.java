package com.mydentalplatform.provider;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

/** Public identity projection shared by the API and search-engine pages. */
@Service
public class PublicProviderService {
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    public PublicProviderService(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate; this.objectMapper = objectMapper;
    }
    public List<String> publishedSlugs() {
        return jdbcTemplate.queryForList("""
            SELECT DISTINCT p.slug FROM providers p
            JOIN provider_marketplace_listings ml ON ml.provider_id = p.id AND ml.publication_status = 'published'
            JOIN provider_location_memberships m ON m.provider_id = p.id AND m.status = 'active'
            JOIN practice_locations l ON l.id = m.location_id AND l.active = true
            WHERE p.active = true AND p.verification_status = 'verified'
            ORDER BY p.slug
            """, String.class);
    }
    public List<Map<String, Object>> clinicDentists(UUID clinicId) {
        return jdbcTemplate.queryForList("""
            SELECT DISTINCT p.full_name AS name, p.slug FROM providers p
            JOIN provider_marketplace_listings ml ON ml.provider_id = p.id AND ml.publication_status = 'published'
            JOIN provider_location_memberships m ON m.provider_id = p.id AND m.status = 'active'
            JOIN practice_locations l ON l.id = m.location_id AND l.active = true
            WHERE p.active = true AND p.verification_status = 'verified' AND l.clinic_id = ?
            ORDER BY p.full_name, p.slug
            """, clinicId);
    }
    public Map<String, Object> profile(String slug) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
            SELECT p.id, p.slug, p.full_name, p.qualification, p.speciality, p.biography,
                   p.experience_years, p.photo_url, p.languages::text AS languages,
                   p.registration_council, p.verified_at, l.id AS location_id, l.name AS location_name,
                   (select c.marketplace_slug from clinics c where c.id = l.clinic_id and c.marketplace_status = 'verified' and c.active = true) as booking_slug,
                   l.address_line1, l.address_line2, l.locality, l.city, l.state, l.postal_code,
                   l.latitude, l.longitude, l.timezone, l.phone_e164,
                   m.consultation_fee, m.accepting_new_patients, m.schedule::text AS schedule,
                   -- // COMPAT(legacy-doctor)
                   (p.legacy_doctor_id IS NULL AND l.clinic_id IS NULL) AS is_independent
            FROM providers p
            JOIN provider_marketplace_listings ml ON ml.provider_id = p.id AND ml.publication_status = 'published'
            JOIN provider_location_memberships m ON m.provider_id = p.id AND m.status = 'active'
            JOIN practice_locations l ON l.id = m.location_id AND l.active = true
            WHERE p.slug = ? AND p.active = true AND p.verification_status = 'verified'
            ORDER BY l.city, l.name
            """, slug.trim().toLowerCase(Locale.ROOT));
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Dentist not found.");
        Map<String, Object> first = rows.getFirst();
        UUID providerId = (UUID) first.get("id");
        Map<String, Object> profile = new LinkedHashMap<>();
        profile.put("id", providerId);
        profile.put("slug", first.get("slug"));
        profile.put("fullName", first.get("full_name"));
        profile.put("qualification", first.get("qualification"));
        profile.put("speciality", first.get("speciality"));
        profile.put("biography", first.get("biography"));
        profile.put("experienceYears", first.get("experience_years"));
        profile.put("photoUrl", first.get("photo_url"));
        profile.put("verifiedAt", first.get("verified_at"));
        profile.put("languages", jsonList((String) first.get("languages")));
        boolean isIndependent = Boolean.TRUE.equals(first.get("is_independent"));
        profile.put("isIndependent", isIndependent);
        profile.put("bookingSlug", first.get("booking_slug"));
        profile.put("eligibleForVideo", true);
        profile.put("eligibleForInClinic", !isIndependent);
        profile.put("consultationModes", isIndependent ? List.of("video") : List.of("in_person", "video"));
        profile.put("verification", Map.of(
            "registrationVerified", true,
            "registrationCouncil", String.valueOf(first.getOrDefault("registration_council", ""))));
        profile.put("services", jdbcTemplate.queryForList(
            "SELECT service_id FROM provider_services WHERE provider_id = ? AND active = true ORDER BY service_id",
            String.class, providerId));
        profile.put("practiceLocations", rows.stream().map(this::location).toList());
        return profile;
    }

    private Map<String, Object> location(Map<String, Object> row) {
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("id", row.get("location_id"));
        value.put("name", row.get("location_name"));
        value.put("clinicSlug", row.get("booking_slug"));
        value.put("addressLine1", row.get("address_line1"));
        value.put("addressLine2", row.get("address_line2"));
        value.put("locality", row.get("locality"));
        value.put("city", row.get("city"));
        value.put("state", row.get("state"));
        value.put("postalCode", row.get("postal_code"));
        value.put("latitude", row.get("latitude"));
        value.put("longitude", row.get("longitude"));
        value.put("timezone", row.get("timezone"));
        value.put("phoneE164", row.get("phone_e164"));
        value.put("consultationFee", row.get("consultation_fee"));
        value.put("acceptingNewPatients", row.get("accepting_new_patients"));
        value.put("schedule", jsonMap((String) row.get("schedule")));
        return value;
    }

    private List<Object> jsonList(String value) {
        try { return objectMapper.readValue(value, new TypeReference<>() {}); }
        catch (Exception error) { return List.of(); }
    }

    private Map<String, Object> jsonMap(String value) {
        try { return objectMapper.readValue(value, new TypeReference<>() {}); }
        catch (Exception error) { return Map.of(); }
    }
}
