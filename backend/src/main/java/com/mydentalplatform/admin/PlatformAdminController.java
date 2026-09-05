package com.mydentalplatform.admin;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
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
@RequestMapping("/api/admin")
public class PlatformAdminController {
    private static final List<String> PRIVATE_FIELDS = List.of(
        "adminUid", "adminEmail", "billingEmail", "billingNotes", "billingCycle",
        "lastPaymentDate", "lastPaymentAmount", "lastPaymentRef", "razorpaySubscriptionId",
        "pendingRazorpaySubscriptionId", "pendingPlan", "pendingBillingCycle", "leadSource",
        "marketingAttribution", "grandfatheredUntil", "grandfatheredPlan", "voiceBudgetCap", "voiceAutoStop");
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final PasswordEncoder passwordEncoder;

    public PlatformAdminController(
        JdbcTemplate jdbcTemplate,
        ObjectMapper objectMapper,
        PasswordEncoder passwordEncoder
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
        this.passwordEncoder = passwordEncoder;
    }

    @GetMapping("/clinics")
    List<Map<String, Object>> clinics(@AuthenticationPrincipal Jwt jwt) {
        requireAdmin(jwt);
        return clinicQuery("order by c.created_at desc");
    }

    @GetMapping("/clinics/{clinicId}")
    ResponseEntity<Map<String, Object>> clinic(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID clinicId) {
        requireAdmin(jwt);
        return ResponseEntity.ofNullable(clinicQuery("where c.id = ?", clinicId).stream().findFirst().orElse(null));
    }

    @GetMapping("/clinics/by-host")
    ResponseEntity<Map<String, Object>> clinicByHost(@AuthenticationPrincipal Jwt jwt, @RequestParam String host) {
        requireAdmin(jwt);
        return ResponseEntity.ofNullable(clinicQuery("""
            where lower(c.public_config ->> 'domain') = lower(?)
               or lower(c.public_config ->> 'vercelDomain') = lower(?) limit 1
            """, host, host).stream().findFirst().orElse(null));
    }

    @PostMapping("/clinics")
    Map<String, String> createClinic(@AuthenticationPrincipal Jwt jwt, @RequestBody Map<String, Object> request) {
        requireAdmin(jwt);
        String name = text(request.get("name"));
        if (name.isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Clinic name is required.");
        UUID id = UUID.randomUUID();
        Map<String, Object> publicData = publicData(request);
        Map<String, Object> privateData = privateData(request);
        jdbcTemplate.update("""
            insert into clinics (id, name, active, marketplace_status, marketplace_slug,
                subscription_plan, subscription_status, public_config)
            values (?, ?, ?, ?, ?, ?, ?, cast(? as jsonb))
            """, id, name, booleanValue(request.get("active"), true),
            allowed(request.get("marketplaceStatus"), List.of("unlisted", "pending", "verified", "suspended"), "unlisted"),
            blankToNull(request.get("marketplaceSlug")),
            allowed(request.get("subscriptionPlan"), List.of("trial", "starter", "pro"), "trial"),
            textOr(request.get("subscriptionStatus"), "trial"), json(publicData));
        jdbcTemplate.update("""
            insert into clinic_private_accounts (clinic_id, billing_email, billing_config)
            values (?, ?, cast(? as jsonb))
            """, id, blankToNull(privateData.get("billingEmail")), json(privateData));
        return Map.of("id", id.toString());
    }

    @PatchMapping("/clinics/{clinicId}")
    ResponseEntity<Void> updateClinic(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable UUID clinicId,
        @RequestBody Map<String, Object> request
    ) {
        requireAdmin(jwt);
        Map<String, Object> publicData = publicData(request);
        Map<String, Object> privateData = privateData(request);
        int updated = jdbcTemplate.update("""
            update clinics set name = coalesce(nullif(?, ''), name),
                active = case when ? then ? else active end,
                subscription_plan = coalesce(nullif(?, ''), subscription_plan),
                subscription_status = coalesce(nullif(?, ''), subscription_status),
                public_config = public_config || cast(? as jsonb), updated_at = now()
            where id = ?
            """, text(request.get("name")), request.containsKey("active"), booleanValue(request.get("active"), true),
            text(request.get("subscriptionPlan")), text(request.get("subscriptionStatus")), json(publicData), clinicId);
        if (updated != 1) return ResponseEntity.notFound().build();
        if (!privateData.isEmpty()) {
            jdbcTemplate.update("""
                insert into clinic_private_accounts (clinic_id, billing_email, billing_config)
                values (?, ?, cast(? as jsonb))
                on conflict (clinic_id) do update set
                    billing_email = coalesce(excluded.billing_email, clinic_private_accounts.billing_email),
                    billing_config = clinic_private_accounts.billing_config || excluded.billing_config,
                    updated_at = now()
                """, clinicId, blankToNull(privateData.get("billingEmail")), json(privateData));
        }
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/clinics/{clinicId}")
    ResponseEntity<Void> deleteClinic(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID clinicId) {
        requireAdmin(jwt);
        try {
            jdbcTemplate.update("delete from clinic_private_accounts where clinic_id = ?", clinicId);
            int deleted = jdbcTemplate.update("delete from clinics where id = ?", clinicId);
            return deleted == 1 ? ResponseEntity.noContent().build() : ResponseEntity.notFound().build();
        } catch (DataIntegrityViolationException error) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "Clinic cannot be deleted while it has users, appointments, or billing records.", error);
        }
    }

    @PostMapping("/clinics/{clinicId}/owner")
    @Transactional
    Map<String, Object> owner(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable UUID clinicId,
        @RequestBody Map<String, Object> request
    ) {
        requireAdmin(jwt);
        String email = text(request.get("email")).toLowerCase(java.util.Locale.ROOT);
        String password = text(request.get("password"));
        if (!email.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Valid owner login email is required.");
        }
        if (!password.isBlank() && password.length() < 8) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Temporary password must be at least 8 characters.");
        }
        Boolean clinicExists = jdbcTemplate.queryForObject(
            "select exists(select 1 from clinics where id = ?)", Boolean.class, clinicId);
        if (!Boolean.TRUE.equals(clinicExists)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Clinic not found.");

        List<Map<String, Object>> existing = jdbcTemplate.queryForList(
            "select id, clinic_id, role::text as role from users where lower(email) = lower(?) for update", email);
        UUID ownerId;
        if (existing.isEmpty()) {
            if (password.isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "Password is required when creating a clinic owner login.");
            ownerId = UUID.randomUUID();
            jdbcTemplate.update("""
                insert into users (id, clinic_id, role, email, password_hash, email_verified)
                values (?, ?, 'clinic_admin', ?, ?, true)
                """, ownerId, clinicId, email, passwordEncoder.encode(password));
        } else {
            Map<String, Object> user = existing.getFirst();
            if ("platform_admin".equals(user.get("role"))) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Platform administrator accounts cannot be assigned to a clinic.");
            }
            UUID existingClinic = (UUID) user.get("clinic_id");
            if (existingClinic != null && !existingClinic.equals(clinicId)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This owner email is already linked to another clinic.");
            }
            ownerId = (UUID) user.get("id");
            jdbcTemplate.update("""
                update users set clinic_id = ?, role = 'clinic_admin', email_verified = true,
                    password_hash = case when ? = '' then password_hash else ? end,
                    password_migration_required = false, updated_at = now() where id = ?
                """, clinicId, password, password.isBlank() ? "" : passwordEncoder.encode(password), ownerId);
        }
        jdbcTemplate.update("""
            insert into clinic_private_accounts (clinic_id, billing_email, billing_config)
            values (?, ?, jsonb_build_object('adminUid', ?, 'adminEmail', ?))
            on conflict (clinic_id) do update set
                billing_email = coalesce(clinic_private_accounts.billing_email, excluded.billing_email),
                billing_config = clinic_private_accounts.billing_config || excluded.billing_config,
                updated_at = now()
            """, clinicId, email, ownerId.toString(), email);
        return Map.of("ok", true, "uid", ownerId.toString(), "email", email, "passwordChanged", !password.isBlank());
    }

    @GetMapping("/clinics/{clinicId}/verification")
    ResponseEntity<Map<String, Object>> verification(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable UUID clinicId
    ) {
        requireAdmin(jwt);
        return ResponseEntity.ofNullable(jdbcTemplate.query("""
            select status, evidence::text as evidence, reviewed_at from provider_verifications where clinic_id = ?
            """, resultSet -> {
                if (!resultSet.next()) return null;
                Map<String, Object> value = parse(resultSet.getString("evidence"));
                value.put("status", resultSet.getString("status"));
                value.put("reviewedAt", instant(resultSet, "reviewed_at"));
                return value;
            }, clinicId));
    }

    @PatchMapping("/clinics/{clinicId}/marketplace")
    @Transactional
    ResponseEntity<Void> marketplace(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable UUID clinicId,
        @RequestBody Map<String, Object> request
    ) {
        requireAdmin(jwt);
        String status = allowed(request.get("status"), List.of("unlisted", "pending", "verified", "suspended"), "unlisted");
        String slug = text(request.get("slug"));
        if (!"unlisted".equals(status) && slug.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Marketplace slug is required.");
        }
        Object profile = request.get("profile");
        Object verifiedDoctors = request.get("verifiedDoctorIds");
        int updated;
        try {
            updated = jdbcTemplate.update("""
                update clinics set marketplace_status = ?, marketplace_slug = nullif(?, ''),
                    public_config = public_config || jsonb_build_object(
                        'marketplaceProfile', cast(? as jsonb),
                        'marketplaceVerifiedDoctorIds', cast(? as jsonb),
                        'marketplaceVerifiedAt', case when ? = 'verified' then to_jsonb(now()::text) else 'null'::jsonb end
                    ), updated_at = now() where id = ?
                """, status, slug, json(profile), json(verifiedDoctors), status, clinicId);
        } catch (DataIntegrityViolationException error) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "That marketplace slug is already assigned.", error);
        }
        if (updated != 1) return ResponseEntity.notFound().build();
        UUID reviewer = UUID.fromString(jwt.getSubject());
        Object evidence = request.getOrDefault("verification", Map.of());
        jdbcTemplate.update("""
            insert into provider_verifications (clinic_id, status, evidence, reviewed_by, reviewed_at)
            values (?, ?, cast(? as jsonb), ?, now())
            on conflict (clinic_id) do update set status = excluded.status, evidence = excluded.evidence,
                reviewed_by = excluded.reviewed_by, reviewed_at = now(), updated_at = now()
            """, clinicId, status, json(evidence), reviewer);
        jdbcTemplate.update("""
            insert into provider_verification_events (clinic_id, reviewer_id, status, data)
            values (?, ?, ?, cast(? as jsonb))
            """, clinicId, reviewer, status, json(request));
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/appointments")
    List<Map<String, Object>> appointments(@AuthenticationPrincipal Jwt jwt) {
        requireAdmin(jwt);
        return jdbcTemplate.query("""
            select id, clinic_id, booking_ref, patient_name, phone_e164, service,
                   appointment_date, appointment_time, status, source, confirmation_deadline,
                   confirmation_responded_at, confirmed_at, created_at
            from appointments order by created_at desc
            """, (resultSet, rowNumber) -> {
                Map<String, Object> value = new LinkedHashMap<>();
                value.put("id", resultSet.getObject("id", UUID.class).toString());
                value.put("clinicId", resultSet.getObject("clinic_id", UUID.class).toString());
                value.put("bookingRef", resultSet.getString("booking_ref"));
                value.put("name", resultSet.getString("patient_name"));
                value.put("phone", resultSet.getString("phone_e164"));
                value.put("service", resultSet.getString("service"));
                value.put("date", resultSet.getObject("appointment_date").toString());
                value.put("time", resultSet.getObject("appointment_time").toString());
                value.put("status", resultSet.getString("status"));
                value.put("source", resultSet.getString("source"));
                value.put("confirmationDeadline", instant(resultSet, "confirmation_deadline"));
                value.put("confirmationRespondedAt", instant(resultSet, "confirmation_responded_at"));
                value.put("confirmedAt", instant(resultSet, "confirmed_at"));
                value.put("createdAt", instant(resultSet, "created_at"));
                return value;
            });
    }

    @GetMapping("/settings/costs")
    Map<String, Object> costs(@AuthenticationPrincipal Jwt jwt) {
        requireAdmin(jwt);
        return jdbcTemplate.query("select value::text as value from platform_settings where setting_key = 'costs'",
            resultSet -> resultSet.next() ? parse(resultSet.getString("value")) : defaultCosts());
    }

    @PatchMapping("/settings/costs")
    ResponseEntity<Void> saveCosts(@AuthenticationPrincipal Jwt jwt, @RequestBody Map<String, Object> request) {
        requireAdmin(jwt);
        jdbcTemplate.update("""
            insert into platform_settings (setting_key, value) values ('costs', cast(? as jsonb))
            on conflict (setting_key) do update set value = excluded.value, updated_at = now()
            """, json(request));
        return ResponseEntity.noContent().build();
    }

    private List<Map<String, Object>> clinicQuery(String suffix, Object... arguments) {
        return jdbcTemplate.query("""
            select c.*, c.public_config::text as public_json, p.billing_email,
                   p.billing_config::text as private_json, u.id as admin_id, u.email as admin_email
            from clinics c left join clinic_private_accounts p on p.clinic_id = c.id
            left join users u on u.clinic_id = c.id and u.role = 'clinic_admin'
            """ + suffix, (resultSet, rowNumber) -> clinic(resultSet), arguments);
    }

    private Map<String, Object> clinic(ResultSet resultSet) throws SQLException {
        Map<String, Object> value = parse(resultSet.getString("public_json"));
        String privateJson = resultSet.getString("private_json");
        if (privateJson != null) value.putAll(parse(privateJson));
        UUID id = resultSet.getObject("id", UUID.class);
        UUID adminId = resultSet.getObject("admin_id", UUID.class);
        value.put("id", id.toString());
        value.put("clinicId", id.toString());
        value.put("name", resultSet.getString("name"));
        value.put("active", resultSet.getBoolean("active"));
        value.put("marketplaceStatus", resultSet.getString("marketplace_status"));
        value.put("marketplaceSlug", resultSet.getString("marketplace_slug"));
        value.put("subscriptionPlan", resultSet.getString("subscription_plan"));
        value.put("subscriptionStatus", resultSet.getString("subscription_status"));
        value.put("billingEmail", resultSet.getString("billing_email"));
        value.put("adminUid", adminId == null ? null : adminId.toString());
        value.put("adminEmail", resultSet.getString("admin_email"));
        value.put("createdAt", instant(resultSet, "created_at"));
        return value;
    }

    private Map<String, Object> publicData(Map<String, Object> request) {
        Map<String, Object> result = new LinkedHashMap<>(request);
        PRIVATE_FIELDS.forEach(result::remove);
        result.keySet().removeAll(List.of("id", "clinicId", "active", "marketplaceStatus", "marketplaceSlug",
            "subscriptionPlan", "subscriptionStatus", "createdAt"));
        return result;
    }

    private Map<String, Object> privateData(Map<String, Object> request) {
        Map<String, Object> result = new LinkedHashMap<>();
        PRIVATE_FIELDS.forEach(key -> { if (request.containsKey(key)) result.put(key, request.get(key)); });
        return result;
    }

    private void requireAdmin(Jwt jwt) {
        if (!"platform_admin".equals(jwt.getClaimAsString("role"))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Platform administrator access is required.");
        }
    }

    private Map<String, Object> defaultCosts() {
        return new LinkedHashMap<>(Map.of("vercel", 0, "firebase", 0, "domain", 0, "other", 0));
    }

    private String text(Object value) { return value == null ? "" : String.valueOf(value).trim(); }
    private String textOr(Object value, String fallback) { String text = text(value); return text.isBlank() ? fallback : text; }
    private String blankToNull(Object value) { String text = text(value); return text.isBlank() ? null : text; }
    private boolean booleanValue(Object value, boolean fallback) { return value instanceof Boolean booleanValue ? booleanValue : fallback; }
    private String allowed(Object value, List<String> values, String fallback) { String text = text(value); return values.contains(text) ? text : fallback; }

    private String json(Object value) {
        try { return objectMapper.writeValueAsString(value == null ? Map.of() : value); }
        catch (JacksonException error) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid JSON data.", error); }
    }

    private Map<String, Object> parse(String value) {
        try { return new LinkedHashMap<>(objectMapper.readValue(value, new TypeReference<>() {})); }
        catch (JacksonException error) { throw new IllegalStateException("Stored JSON is invalid.", error); }
    }

    private String instant(ResultSet resultSet, String column) throws SQLException {
        OffsetDateTime value = resultSet.getObject(column, OffsetDateTime.class);
        return value == null ? null : value.toInstant().toString();
    }
}