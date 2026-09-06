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
                lower(public_config ->> 'hostedDomain') = lower(?)
            )
            order by case when lower(public_config ->> 'domain') = lower(?) then 0 else 1 end
            limit 1
            """, host, host, host).stream().findFirst();
    }

    public Optional<Map<String, Object>> findCurrent(UUID clinicId) {
        return clinicQuery("where id = ? and active = true limit 1", clinicId).stream().findFirst();
    }

    public List<Map<String, Object>> findMarketplace(String region) {
        return findMarketplace(region, null, null, null, null, 50, 0);
    }

    public List<Map<String, Object>> findMarketplace(
        String region, String locality, String serviceId,
        Boolean acceptingNewPatients, String query, int limit, int offset
    ) {
        StringBuilder sql = new StringBuilder("""
            SELECT id, active, marketplace_status, marketplace_slug,
                   subscription_plan, subscription_status, rating_count, average_rating,
                   public_config::text AS public_config
            FROM clinics
            WHERE active = true AND marketplace_status = 'verified'
              AND lower(public_config -> 'marketplaceProfile' ->> 'region') = lower(?)
            """);
        List<Object> params = new java.util.ArrayList<>();
        params.add(region);

        if (locality != null && !locality.isBlank()) {
            sql.append(" AND lower(public_config -> 'marketplaceProfile' ->> 'locality') = lower(?)");
            params.add(locality.trim());
        }
        if (serviceId != null && !serviceId.isBlank()) {
            sql.append(" AND public_config -> 'marketplaceProfile' -> 'serviceIds' @> cast(? AS jsonb)");
            params.add("[\"" + serviceId.trim().replace("\"", "") + "\"]");
        }
        if (acceptingNewPatients != null) {
            sql.append(" AND (public_config -> 'marketplaceProfile' ->> 'acceptingNewPatients')::boolean = ?");
            params.add(acceptingNewPatients);
        }
        if (query != null && !query.isBlank()) {
            String pattern = "%" + query.trim().toLowerCase() + "%";
            sql.append(" AND (lower(name) LIKE ? OR lower(public_config ->> 'doctorName') LIKE ?)");
            params.add(pattern);
            params.add(pattern);
        }

        sql.append(" ORDER BY average_rating DESC NULLS LAST, name ASC");
        sql.append(" LIMIT ? OFFSET ?");
        params.add(Math.min(limit, 50));
        params.add(Math.max(offset, 0));

        return new java.util.ArrayList<>(jdbcTemplate.query(sql.toString(), (resultSet, rowNumber) -> {
            Map<String, Object> clinic = json(resultSet.getString("public_config"));
            String id = resultSet.getObject("id", java.util.UUID.class).toString();
            clinic.put("id", id);
            clinic.put("clinicId", id);
            clinic.put("active", resultSet.getBoolean("active"));
            clinic.put("marketplaceStatus", resultSet.getString("marketplace_status"));
            clinic.put("marketplaceSlug", resultSet.getString("marketplace_slug"));
            clinic.put("subscriptionPlan", resultSet.getString("subscription_plan"));
            clinic.put("subscriptionStatus", resultSet.getString("subscription_status"));
            clinic.put("ratingCount", resultSet.getInt("rating_count"));
            clinic.put("averageRating", resultSet.getBigDecimal("average_rating"));
            return clinic;
        }, params.toArray()));
    }

    public int countMarketplace(String region, String locality, String serviceId,
                                Boolean acceptingNewPatients, String query) {
        StringBuilder sql = new StringBuilder("""
            SELECT count(*) FROM clinics
            WHERE active = true AND marketplace_status = 'verified'
              AND lower(public_config -> 'marketplaceProfile' ->> 'region') = lower(?)
            """);
        List<Object> params = new java.util.ArrayList<>();
        params.add(region);
        if (locality != null && !locality.isBlank()) {
            sql.append(" AND lower(public_config -> 'marketplaceProfile' ->> 'locality') = lower(?)");
            params.add(locality.trim());
        }
        if (serviceId != null && !serviceId.isBlank()) {
            sql.append(" AND public_config -> 'marketplaceProfile' -> 'serviceIds' @> cast(? AS jsonb)");
            params.add("[\"" + serviceId.trim().replace("\"", "") + "\"]");
        }
        if (acceptingNewPatients != null) {
            sql.append(" AND (public_config -> 'marketplaceProfile' ->> 'acceptingNewPatients')::boolean = ?");
            params.add(acceptingNewPatients);
        }
        if (query != null && !query.isBlank()) {
            String pattern = "%" + query.trim().toLowerCase() + "%";
            sql.append(" AND (lower(name) LIKE ? OR lower(public_config ->> 'doctorName') LIKE ?)");
            params.add(pattern);
            params.add(pattern);
        }
        return jdbcTemplate.queryForObject(sql.toString(), Integer.class, params.toArray());
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
        validateSettings(safe);
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
                   subscription_plan, subscription_status, rating_count, average_rating, public_config::text as public_config
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
            clinic.put("ratingCount", resultSet.getInt("rating_count"));
            clinic.put("averageRating", resultSet.getBigDecimal("average_rating"));
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

    private void validateSettings(Map<String, Object> settings) {
        Object name = settings.get("name");
        if (name != null && (!(name instanceof String) || ((String) name).isBlank() || ((String) name).length() > 160)) {
            throw new IllegalArgumentException("Clinic name must be between 1 and 160 characters.");
        }
        Object phone = settings.get("phone");
        if (phone instanceof String p && !p.isBlank() && !p.matches("^\\+?[0-9\\s\\-()]{7,20}$")) {
            throw new IllegalArgumentException("Phone number format is invalid.");
        }
        Object services = settings.get("services");
        if (services != null && !(services instanceof java.util.List)) {
            throw new IllegalArgumentException("Services must be a list.");
        }
        if (services instanceof java.util.List<?> list) {
            for (Object entry : list) {
                if (!(entry instanceof Map)) {
                    throw new IllegalArgumentException("Each service must be an object with a name.");
                }
                Object serviceName = ((Map<?, ?>) entry).get("name");
                if (serviceName == null || !(serviceName instanceof String) || ((String) serviceName).isBlank()) {
                    throw new IllegalArgumentException("Each service must have a non-blank name.");
                }
            }
        }
        Object hours = settings.get("hours");
        if (hours != null && !(hours instanceof java.util.List)) {
            throw new IllegalArgumentException("Hours must be a list.");
        }
        Object profile = settings.get("marketplaceProfile");
        if (profile instanceof Map<?, ?> mp) {
            Object serviceIds = mp.get("serviceIds");
            if (serviceIds instanceof java.util.List<?> ids) {
                java.util.Set<String> valid = java.util.Set.of(
                    "dental-consultation", "cleaning-scaling", "tooth-fillings", "root-canal",
                    "tooth-extraction", "wisdom-tooth", "dental-implants", "crowns-bridges",
                    "dentures", "braces-orthodontics", "clear-aligners", "pediatric-dentistry",
                    "gum-treatment", "teeth-whitening", "veneers-smile-design", "emergency-dental-care");
                for (Object id : ids) {
                    if (!(id instanceof String) || !valid.contains(id)) {
                        throw new IllegalArgumentException("Invalid dental service ID: " + id);
                    }
                }
            }
        }
    }

    private String instant(java.sql.ResultSet resultSet, String column) throws java.sql.SQLException {
        java.time.OffsetDateTime value = resultSet.getObject(column, java.time.OffsetDateTime.class);
        return value == null ? null : value.toInstant().toString();
    }
}
