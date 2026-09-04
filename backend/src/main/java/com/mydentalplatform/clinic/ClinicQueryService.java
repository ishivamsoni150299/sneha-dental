package com.mydentalplatform.clinic;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

@Service
public class ClinicQueryService {
    private static final List<String> SETTINGS_FIELDS = List.of(
        "name", "doctorName", "doctorQualification", "patientCount", "doctorBio",
        "phone", "phoneE164", "whatsappNumber", "addressLine1", "addressLine2", "city",
        "mapEmbedUrl", "mapDirectionsUrl", "hours", "services", "testimonials", "social",
        "theme", "logoDataUrl", "marketplaceProfile", "onboardingDismissed", "onboardingSharedWebsite");
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public ClinicQueryService(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    public Optional<Map<String, Object>> resolveByHost(String host) {
        return clinicQuery("""
            where active = true and (
                lower(public_config ->> 'domain') = lower(?) or
                lower(public_config ->> 'vercelDomain') = lower(?)
            )
            order by case when lower(public_config ->> 'domain') = lower(?) then 0 else 1 end
            limit 1
            """, host, host, host).stream().findFirst();
    }

    public Optional<Map<String, Object>> findCurrent(UUID clinicId) {
        return clinicQuery("where id = ? and active = true limit 1", clinicId).stream().findFirst();
    }

    public List<Map<String, Object>> findMarketplace(String region) {
        return clinicQuery("""
            where active = true and marketplace_status = 'verified'
              and lower(public_config -> 'marketplaceProfile' ->> 'region') = lower(?)
            order by public_config ->> 'marketplaceVerifiedAt' desc nulls last
            limit 100
            """, region);
    }

    public Optional<Map<String, Object>> findMarketplaceBySlug(String slug) {
        return clinicQuery("""
            where active = true and marketplace_status = 'verified'
              and marketplace_slug = ?
            limit 1
            """, slug).stream().findFirst();
    }

    public List<Map<String, Object>> publishedReviews(UUID clinicId) {
        return jdbcTemplate.query("""
            select id, clinic_id, rating, review_text, patient_alias, published_at,
                   clinic_response, clinic_responded_at
            from appointment_reviews
            where clinic_id = ? and moderation_status = 'published'
            order by published_at desc
            limit 50
            """, (resultSet, rowNumber) -> {
                Map<String, Object> review = new LinkedHashMap<>();
                review.put("id", resultSet.getObject("id", UUID.class).toString());
                review.put("clinicId", resultSet.getObject("clinic_id", UUID.class).toString());
                review.put("rating", resultSet.getInt("rating"));
                review.put("text", resultSet.getString("review_text"));
                review.put("patientAlias", resultSet.getString("patient_alias"));
                review.put("publishedAt", instant(resultSet, "published_at"));
                review.put("clinicResponse", resultSet.getString("clinic_response"));
                review.put("clinicRespondedAt", instant(resultSet, "clinic_responded_at"));
                return review;
            }, clinicId);
    }

    public void markOnboarding(UUID clinicId, String field) {
        if (!List.of("onboardingDismissed", "onboardingSharedWebsite").contains(field)) {
            throw new IllegalArgumentException("Unsupported onboarding field.");
        }
        jdbcTemplate.update("""
            update clinics
            set public_config = jsonb_set(public_config, array[?], 'true'::jsonb, true),
                updated_at = now()
            where id = ?
            """, field, clinicId);
    }

    public void updateSettings(UUID clinicId, Map<String, Object> request) {
        Map<String, Object> safe = new LinkedHashMap<>();
        request.forEach((key, value) -> {
            if (SETTINGS_FIELDS.contains(key)) safe.put(key, value);
        });
        if (safe.isEmpty()) throw new IllegalArgumentException("No clinic settings fields to update.");
        int updated = jdbcTemplate.update("""
            update clinics
            set name = coalesce(nullif(?, ''), name),
                public_config = public_config || cast(? as jsonb),
                updated_at = now()
            where id = ?
            """, safe.getOrDefault("name", ""), jsonString(safe), clinicId);
        if (updated != 1) throw new IllegalArgumentException("Clinic not found.");
    }

    private List<Map<String, Object>> clinicQuery(String suffix, Object... arguments) {
        String sql = """
            select id, active, marketplace_status, marketplace_slug,
                   subscription_plan, subscription_status, public_config::text as public_config
            from clinics
            """ + suffix;
        return new ArrayList<>(jdbcTemplate.query(sql, (resultSet, rowNumber) -> {
            Map<String, Object> clinic = json(resultSet.getString("public_config"));
            String id = resultSet.getObject("id", UUID.class).toString();
            clinic.put("id", id);
            clinic.put("clinicId", id);
            clinic.put("active", resultSet.getBoolean("active"));
            clinic.put("marketplaceStatus", resultSet.getString("marketplace_status"));
            clinic.put("marketplaceSlug", resultSet.getString("marketplace_slug"));
            clinic.put("subscriptionPlan", resultSet.getString("subscription_plan"));
            clinic.put("subscriptionStatus", resultSet.getString("subscription_status"));
            return clinic;
        }, arguments));
    }

    private Map<String, Object> json(String value) {
        try {
            return new LinkedHashMap<>(objectMapper.readValue(value, new TypeReference<>() {}));
        } catch (JacksonException error) {
            throw new IllegalStateException("Clinic configuration contains invalid JSON.", error);
        }
    }

    private String jsonString(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JacksonException error) {
            throw new IllegalArgumentException("Clinic settings are invalid.", error);
        }
    }

    private String instant(java.sql.ResultSet resultSet, String column) throws java.sql.SQLException {
        java.time.OffsetDateTime value = resultSet.getObject(column, java.time.OffsetDateTime.class);
        return value == null ? null : value.toInstant().toString();
    }
}