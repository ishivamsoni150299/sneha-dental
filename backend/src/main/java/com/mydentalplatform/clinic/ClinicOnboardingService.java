package com.mydentalplatform.clinic;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

@Service
public class ClinicOnboardingService {
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public ClinicOnboardingService(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    public boolean slugAvailable(String slug) {
        return Boolean.FALSE.equals(jdbcTemplate.queryForObject("""
            select exists(select 1 from clinics where lower(public_config ->> 'hostedDomain') = lower(?))
            """, Boolean.class, slug + ".mydentalplatform.com"));
    }

    @Transactional
    public Map<String, Object> create(UUID userId, String email, Map<String, Object> request) {
        String name = text(request.get("name"), 160);
        String phone = text(request.get("phone"), 24);
        String slug = slug(String.valueOf(request.getOrDefault("slug", name)));
        if (name.isBlank() || phone.isBlank() || slug.isBlank()) {
            throw new IllegalArgumentException("Clinic name, phone, and subdomain are required.");
        }
        String role = jdbcTemplate.queryForObject(
            "select role::text from users where id = ? for update", String.class, userId);
        if (!"incomplete_signup".equals(role)) {
            throw new IllegalStateException("This account already completed clinic setup.");
        }
        if (!slugAvailable(slug)) throw new IllegalArgumentException("This subdomain is already taken.");

        String plan = allowed(request.get("plan"), List.of("trial", "starter", "pro"), "trial");
        String billingCycle = allowed(request.get("billingCycle"), List.of("monthly", "yearly"), "monthly");
        String theme = allowed(request.get("theme"),
            List.of("blue", "teal", "emerald", "purple", "rose", "caramel"), "blue");
        String domain = slug + ".mydentalplatform.com";
        UUID clinicId = UUID.randomUUID();

        Map<String, Object> config = new LinkedHashMap<>();
        config.put("name", name);
        config.put("doctorName", text(request.get("doctorName"), 160));
        config.put("doctorQualification", text(request.get("doctorQualification"), 160));
        config.put("doctorBio", List.of());
        config.put("patientCount", "0");
        config.put("rating", "");
        config.put("phone", phone);
        config.put("phoneE164", text(request.get("phoneE164"), 20));
        config.put("whatsappNumber", text(request.get("whatsappNumber"), 20));
        config.put("addressLine1", text(request.get("addressLine1"), 300));
        config.put("addressLine2", text(request.get("addressLine2"), 300));
        config.put("city", text(request.get("city"), 120));
        config.put("mapEmbedUrl", "");
        config.put("mapDirectionsUrl", "");
        config.put("theme", theme);
        config.put("bookingRefPrefix", slug.substring(0, Math.min(2, slug.length())).toUpperCase(Locale.ROOT));
        config.put("social", Map.of());
        config.put("hours", list(request.get("hours")));
        config.put("services", list(request.get("services")));
        config.put("plans", List.of());
        config.put("testimonials", List.of());
        config.put("hostedDomain", domain);
        config.put("marketingAttribution", request.getOrDefault("marketing", Map.of()));
        config.put("billingCycle", billingCycle);

        jdbcTemplate.update("""
            insert into clinics (
                id, name, active, marketplace_status, subscription_plan, subscription_status, public_config
            ) values (?, ?, true, 'unlisted', ?, ?, cast(? as jsonb))
            """, clinicId, name, plan, "trial".equals(plan) ? "trial" : "pending", json(config));
        jdbcTemplate.update("""
            insert into clinic_private_accounts (clinic_id, billing_email, billing_config)
            values (?, ?, cast(? as jsonb))
            """, clinicId, email, json(Map.of("billingCycle", billingCycle)));
        jdbcTemplate.update("""
            update users set clinic_id = ?, role = 'clinic_admin', updated_at = now() where id = ?
            """, clinicId, userId);

        return Map.of(
            "clinicId", clinicId.toString(),
            "slug", slug,
            "siteUrl", "https://" + domain,
            "adminUrl", "https://www.mydentalplatform.com/business/clinic/dashboard",
            "email", email == null ? "" : email,
            "plan", plan,
            "billingCycle", billingCycle,
            "paymentMode", "manual",
            "manualPaymentUrl", "https://www.mydentalplatform.com/contact");
    }

    private String slug(String value) {
        return value.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "").substring(
            0, Math.min(30, value.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "").length()));
    }

    private String text(Object value, int max) {
        String result = value == null ? "" : String.valueOf(value).trim();
        return result.substring(0, Math.min(max, result.length()));
    }

    private String allowed(Object value, List<String> allowed, String fallback) {
        String candidate = String.valueOf(value);
        return allowed.contains(candidate) ? candidate : fallback;
    }

    private List<?> list(Object value) {
        return value instanceof List<?> values ? values : List.of();
    }

    private String json(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JacksonException error) {
            throw new IllegalArgumentException("Clinic configuration is invalid.", error);
        }
    }
}
