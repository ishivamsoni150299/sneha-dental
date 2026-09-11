package com.mydentalplatform.clinic;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
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
        "theme", "logoDataUrl", "marketplaceProfile", "onboardingDismissed", "onboardingSharedWebsite",
        "googleAnalyticsId");
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
            clinic.put("isIndependent", false);
            clinic.put("eligibleForInClinic", true);
            clinic.put("eligibleForVideo", true);
            clinic.put("consultationModes", List.of("in_person", "video"));
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
        Optional<Map<String, Object>> clinic = clinicQuery("""
            where active = true and marketplace_status = 'verified'
              and marketplace_slug = ?
            limit 1
            """, slug).stream().findFirst();
        if (clinic.isPresent()) {
            return clinic;
        }
        return findIndependentProviderBySlug(slug);
    }

    private Optional<Map<String, Object>> findIndependentProviderBySlug(String slug) {
        List<Map<String, Object>> rows = jdbcTemplate.query("""
            SELECT p.id, p.slug, p.full_name, p.qualification, p.speciality, p.biography,
                   p.experience_years, p.phone_e164, p.photo_url, p.languages::text AS languages,
                   l.id AS location_id, l.name AS location_name, l.address_line1,
                   l.locality, l.city, l.phone_e164 AS location_phone,
                   m.consultation_fee, m.accepting_new_patients, m.schedule::text AS schedule,
                   (SELECT coalesce(jsonb_agg(ps.service_id), '[]'::jsonb)::text
                    FROM provider_services ps WHERE ps.provider_id = p.id AND ps.active) AS service_ids
            FROM providers p
            JOIN provider_marketplace_listings ml ON ml.provider_id = p.id AND ml.publication_status = 'published'
            LEFT JOIN provider_location_memberships m ON m.provider_id = p.id AND m.status = 'active'
            LEFT JOIN practice_locations l ON l.id = m.location_id AND l.active = true
            WHERE p.slug = ? AND p.active = true AND p.verification_status = 'verified'
            ORDER BY l.city, l.name
            LIMIT 1
            """, (rs, rowNum) -> {
                Map<String, Object> map = new LinkedHashMap<>();
                UUID id = rs.getObject("id", UUID.class);
                map.put("id", id.toString());
                map.put("clinicId", id.toString());
                map.put("active", true);
                map.put("marketplaceStatus", "verified");
                map.put("marketplaceSlug", rs.getString("slug"));
                map.put("name", rs.getString("full_name"));
                map.put("doctorName", rs.getString("full_name"));
                map.put("doctorQualification", rs.getString("qualification"));
                map.put("doctorBio", rs.getString("biography"));
                map.put("phone", rs.getString("phone_e164"));
                map.put("phoneE164", rs.getString("phone_e164"));
                map.put("city", rs.getString("city") != null ? rs.getString("city") : "Delhi NCR");
                map.put("addressLine1", rs.getString("address_line1") != null ? rs.getString("address_line1") : "Online Video Consultation");
                map.put("bookingRefPrefix", "MDP");
                map.put("isIndependent", true);
                map.put("eligibleForInClinic", false);
                map.put("eligibleForVideo", true);
                map.put("consultationModes", List.of("video"));

                Map<String, String> defaultHours = new LinkedHashMap<>();
                defaultHours.put("days", "Mon-Sat");
                defaultHours.put("time", "09:00 AM - 07:00 PM");
                map.put("hours", List.of(defaultHours));

                Map<String, Object> mp = new LinkedHashMap<>();
                mp.put("locality", rs.getString("locality"));
                mp.put("speciality", rs.getString("speciality"));
                mp.put("experienceYears", rs.getObject("experience_years", Integer.class));
                Integer fee = rs.getObject("consultation_fee", Integer.class);
                mp.put("consultationFee", fee);
                mp.put("videoConsultationFee", fee);
                mp.put("videoConsultationEnabled", true);
                mp.put("acceptingNewPatients", rs.getObject("accepting_new_patients") == null || rs.getBoolean("accepting_new_patients"));
                List<String> serviceIds = jsonList(rs.getString("service_ids"));
                if (serviceIds.isEmpty()) {
                    serviceIds = List.of("consultation");
                }
                mp.put("serviceIds", serviceIds);
                map.put("marketplaceProfile", mp);

                Map<String, Object> videoService = new LinkedHashMap<>();
                videoService.put("name", "Video Consultation");
                videoService.put("price", fee == null ? null : "₹" + fee);
                Map<String, Object> consultService = new LinkedHashMap<>();
                consultService.put("name", "Consultation");
                consultService.put("price", fee == null ? null : "₹" + fee);
                map.put("services", List.of(videoService, consultService));
                map.put("marketplaceVerifiedDoctorIds", List.of(id.toString()));
                return map;
            }, slug.trim().toLowerCase(Locale.ROOT));
        return rows.stream().findFirst();
    }

    private List<String> jsonList(String value) {
        if (value == null || value.isBlank()) return List.of();
        try {
            return objectMapper.readValue(value, new TypeReference<>() {});
        } catch (JacksonException e) {
            return List.of();
        }
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
            clinic.put("isIndependent", false);
            clinic.put("eligibleForInClinic", true);
            clinic.put("eligibleForVideo", true);
            clinic.put("consultationModes", List.of("in_person", "video"));
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
        Object gaId = settings.get("googleAnalyticsId");
        if (gaId instanceof String gid && !gid.isBlank() && !gid.matches("^G-[A-Za-z0-9]+$")) {
            throw new IllegalArgumentException("Google Analytics ID must be in the format G-XXXXXXXXXX.");
        }
    }

    private String instant(java.sql.ResultSet resultSet, String column) throws java.sql.SQLException {
        java.time.OffsetDateTime value = resultSet.getObject(column, java.time.OffsetDateTime.class);
        return value == null ? null : value.toInstant().toString();
    }
}
