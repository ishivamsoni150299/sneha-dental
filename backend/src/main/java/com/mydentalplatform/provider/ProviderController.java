package com.mydentalplatform.provider;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

@RestController
@RequestMapping("/api")
public class ProviderController {
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public ProviderController(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    @GetMapping("/v1/providers")
    Map<String, Object> search(
        @RequestParam(defaultValue = "") String query,
        @RequestParam(defaultValue = "") String city,
        @RequestParam(defaultValue = "") String serviceId,
        @RequestParam(defaultValue = "20") @Min(1) @Max(50) int limit,
        @RequestParam(defaultValue = "0") @Min(0) int offset
    ) {
        StringBuilder where = new StringBuilder("""
            WHERE p.active = true AND p.verification_status = 'verified'
              AND ml.publication_status = 'published'
              AND m.status = 'active' AND l.active = true
            """);
        List<Object> params = new ArrayList<>();
        if (!query.isBlank()) {
            where.append(" AND (lower(p.full_name) LIKE ? OR lower(coalesce(p.speciality, '')) LIKE ?)");
            String pattern = "%" + query.trim().toLowerCase(Locale.ROOT) + "%";
            params.add(pattern);
            params.add(pattern);
        }
        if (!city.isBlank()) {
            where.append(" AND lower(l.city) = lower(?)");
            params.add(city.trim());
        }
        if (!serviceId.isBlank()) {
            where.append(" AND EXISTS (SELECT 1 FROM provider_services ps WHERE ps.provider_id = p.id AND ps.active = true AND ps.service_id = ?)");
            params.add(serviceId.trim().toLowerCase(Locale.ROOT));
        }
        Integer total = jdbcTemplate.queryForObject("""
            SELECT count(*) FROM providers p
            JOIN provider_marketplace_listings ml ON ml.provider_id = p.id
            JOIN provider_location_memberships m ON m.provider_id = p.id
            JOIN practice_locations l ON l.id = m.location_id
            """ + where, Integer.class, params.toArray());
        List<Object> pageParams = new ArrayList<>(params);
        pageParams.add(limit);
        pageParams.add(offset);
        List<Map<String, Object>> providers = jdbcTemplate.query("""
            SELECT p.id, p.slug, p.full_name, p.qualification, p.speciality,
                   p.experience_years, p.photo_url, p.languages::text AS languages,
                   l.id AS location_id, l.name AS location_name, l.locality, l.city,
                   m.consultation_fee, m.accepting_new_patients
            FROM providers p
            JOIN provider_marketplace_listings ml ON ml.provider_id = p.id
            JOIN provider_location_memberships m ON m.provider_id = p.id
            JOIN practice_locations l ON l.id = m.location_id
            """ + where + " ORDER BY p.full_name, l.city, l.name LIMIT ? OFFSET ?",
            (rs, row) -> {
                Map<String, Object> value = new LinkedHashMap<>();
                value.put("id", rs.getObject("id", UUID.class));
                value.put("slug", rs.getString("slug"));
                value.put("fullName", rs.getString("full_name"));
                value.put("qualification", rs.getString("qualification"));
                value.put("speciality", rs.getString("speciality"));
                value.put("experienceYears", rs.getObject("experience_years", Integer.class));
                value.put("photoUrl", rs.getString("photo_url"));
                value.put("languages", jsonList(rs.getString("languages")));
                value.put("locationId", rs.getObject("location_id", UUID.class));
                value.put("locationName", rs.getString("location_name"));
                value.put("locality", rs.getString("locality"));
                value.put("city", rs.getString("city"));
                value.put("consultationFee", rs.getObject("consultation_fee", Integer.class));
                value.put("acceptingNewPatients", rs.getBoolean("accepting_new_patients"));
                value.put("profilePath", "/dentist/" + rs.getString("slug"));
                return value;
            }, pageParams.toArray());
        return Map.of("providers", providers, "totalCount", total == null ? 0 : total,
            "limit", limit, "offset", offset);
    }

    @GetMapping("/v1/providers/{slug}")
    Map<String, Object> publicProfile(@PathVariable String slug) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
            SELECT p.id, p.slug, p.full_name, p.qualification, p.speciality, p.biography,
                   p.experience_years, p.photo_url, p.languages::text AS languages,
                   p.registration_council, l.id AS location_id, l.name AS location_name,
                   l.address_line1, l.address_line2, l.locality, l.city, l.state, l.postal_code,
                   l.latitude, l.longitude, l.timezone, l.phone_e164,
                   m.consultation_fee, m.accepting_new_patients, m.schedule::text AS schedule
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
        profile.put("languages", jsonList((String) first.get("languages")));
        profile.put("verification", Map.of(
            "registrationVerified", true,
            "registrationCouncil", String.valueOf(first.getOrDefault("registration_council", ""))));
        profile.put("services", jdbcTemplate.queryForList(
            "SELECT service_id FROM provider_services WHERE provider_id = ? AND active = true ORDER BY service_id",
            String.class, providerId));
        profile.put("practiceLocations", rows.stream().map(this::location).toList());
        return profile;
    }

    @GetMapping("/providers/me")
    Map<String, Object> me(@AuthenticationPrincipal Jwt jwt) {
        return providerFor(jwt);
    }

    @PatchMapping("/providers/me")
    ResponseEntity<Void> updateMe(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ProfileRequest request) {
        UUID providerId = providerId(jwt);
        jdbcTemplate.update("""
            UPDATE providers SET full_name = ?, qualification = ?, speciality = ?, biography = ?,
                experience_years = ?, registration_number = ?, registration_council = ?,
                phone_e164 = ?, photo_url = ?, languages = cast(? AS jsonb), updated_at = now()
            WHERE id = ?
            """, request.fullName().trim(), blank(request.qualification()), blank(request.speciality()),
            blank(request.biography()), request.experienceYears(), blank(request.registrationNumber()),
            blank(request.registrationCouncil()), blank(request.phoneE164()), blank(request.photoUrl()),
            json(request.languages()), providerId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/providers/me/locations")
    @Transactional
    ResponseEntity<Map<String, String>> addIndependentLocation(
        @AuthenticationPrincipal Jwt jwt,
        @Valid @RequestBody LocationRequest request
    ) {
        UUID providerId = providerId(jwt);
        UUID locationId = UUID.randomUUID();
        jdbcTemplate.update("""
            INSERT INTO practice_locations (
                id, owner_provider_id, name, address_line1, address_line2, locality,
                city, state, postal_code, phone_e164
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, locationId, providerId, request.name().trim(), request.addressLine1().trim(),
            blank(request.addressLine2()), blank(request.locality()), request.city().trim(),
            blank(request.state()), blank(request.postalCode()), blank(request.phoneE164()));
        jdbcTemplate.update("""
            INSERT INTO provider_location_memberships (
                provider_id, location_id, membership_role, status, consultation_fee,
                accepting_new_patients, schedule, accepted_at
            ) VALUES (?, ?, 'owner', 'active', ?, ?, cast(? AS jsonb), now())
            """, providerId, locationId, request.consultationFee(),
            request.acceptingNewPatients(), json(request.schedule()));
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", locationId.toString()));
    }

    @PostMapping("/providers/me/submit-verification")
    ResponseEntity<Void> submitVerification(@AuthenticationPrincipal Jwt jwt) {
        UUID providerId = providerId(jwt);
        int updated = jdbcTemplate.update("""
            UPDATE providers SET verification_status = 'pending', updated_at = now()
            WHERE id = ? AND verification_status IN ('draft', 'rejected')
              AND qualification IS NOT NULL AND speciality IS NOT NULL
              AND registration_number IS NOT NULL AND registration_council IS NOT NULL
              AND EXISTS (
                  SELECT 1 FROM provider_location_memberships m
                  WHERE m.provider_id = providers.id AND m.status = 'active'
              )
            """, providerId);
        if (updated != 1) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "Complete your qualification, speciality, registration and practice location before submitting.");
        }
        jdbcTemplate.update("""
            UPDATE provider_marketplace_listings SET publication_status = 'pending', updated_at = now()
            WHERE provider_id = ?
            """, providerId);
        return ResponseEntity.accepted().build();
    }

    private Map<String, Object> providerFor(Jwt jwt) {
        UUID providerId = providerId(jwt);
        try {
            Map<String, Object> row = jdbcTemplate.queryForMap("""
                SELECT id, slug, full_name, qualification, speciality, biography, experience_years,
                       registration_number, registration_council, phone_e164, photo_url,
                       languages::text AS languages, verification_status, verified_at, active,
                       (SELECT r.reason FROM provider_verification_reviews r WHERE r.provider_id = providers.id
                        ORDER BY r.created_at DESC LIMIT 1) AS verification_reason
                FROM providers WHERE id = ?
                """, providerId);
            Map<String, Object> profile = new LinkedHashMap<>();
            profile.put("id", row.get("id"));
            profile.put("slug", row.get("slug"));
            profile.put("fullName", row.get("full_name"));
            profile.put("qualification", row.get("qualification"));
            profile.put("speciality", row.get("speciality"));
            profile.put("biography", row.get("biography"));
            profile.put("experienceYears", row.get("experience_years"));
            profile.put("registrationNumber", row.get("registration_number"));
            profile.put("registrationCouncil", row.get("registration_council"));
            profile.put("phoneE164", row.get("phone_e164"));
            profile.put("photoUrl", row.get("photo_url"));
            profile.put("languages", jsonList((String) row.get("languages")));
            profile.put("verificationStatus", row.get("verification_status"));
            profile.put("verificationReason", row.get("verification_reason"));
            profile.put("verifiedAt", row.get("verified_at"));
            profile.put("active", row.get("active"));
            profile.put("locations", jdbcTemplate.queryForList("""
                SELECT l.id, l.name, l.address_line1, l.address_line2, l.locality, l.city,
                       l.state, l.postal_code, l.phone_e164, m.membership_role, m.status,
                       m.consultation_fee, m.accepting_new_patients, m.schedule::text AS schedule
                FROM provider_location_memberships m
                JOIN practice_locations l ON l.id = m.location_id
                WHERE m.provider_id = ? ORDER BY l.city, l.name
                """, providerId));
            return profile;
        } catch (EmptyResultDataAccessException error) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Dentist profile not found.");
        }
    }

    private UUID providerId(Jwt jwt) {
        if (jwt == null || !"dentist".equals(jwt.getClaimAsString("role"))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Dentist access is required.");
        }
        try {
            return jdbcTemplate.queryForObject("SELECT id FROM providers WHERE user_id = ?", UUID.class,
                UUID.fromString(jwt.getSubject()));
        } catch (EmptyResultDataAccessException error) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Dentist profile not found.");
        }
    }

    private Map<String, Object> location(Map<String, Object> row) {
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("id", row.get("location_id"));
        value.put("name", row.get("location_name"));
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

    private Object blank(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String json(Object value) {
        try { return objectMapper.writeValueAsString(value); }
        catch (JacksonException error) { throw new IllegalArgumentException("Invalid profile data.", error); }
    }

    private List<Object> jsonList(String value) {
        try { return objectMapper.readValue(value, new TypeReference<>() {}); }
        catch (Exception error) { return List.of(); }
    }

    private Map<String, Object> jsonMap(String value) {
        try { return objectMapper.readValue(value, new TypeReference<>() {}); }
        catch (Exception error) { return Map.of(); }
    }

    record ProfileRequest(
        @NotBlank @Size(max = 160) String fullName,
        @Size(max = 240) String qualification,
        @Size(max = 160) String speciality,
        @Size(max = 4000) String biography,
        @Min(0) @Max(80) Integer experienceYears,
        @Size(max = 100) String registrationNumber,
        @Size(max = 160) String registrationCouncil,
        @Pattern(regexp = "^$|^\\+[1-9][0-9]{7,14}$") String phoneE164,
        @Size(max = 2000) String photoUrl,
        @NotNull @Size(max = 12) List<@NotBlank @Size(max = 60) String> languages
    ) {}

    record LocationRequest(
        @NotBlank @Size(max = 180) String name,
        @NotBlank @Size(max = 240) String addressLine1,
        @Size(max = 240) String addressLine2,
        @Size(max = 160) String locality,
        @NotBlank @Size(max = 120) String city,
        @Size(max = 120) String state,
        @Pattern(regexp = "^$|^[0-9]{6}$") String postalCode,
        @Pattern(regexp = "^$|^\\+[1-9][0-9]{7,14}$") String phoneE164,
        @Min(0) Integer consultationFee,
        boolean acceptingNewPatients,
        @NotNull Map<String, Object> schedule
    ) {}
}
