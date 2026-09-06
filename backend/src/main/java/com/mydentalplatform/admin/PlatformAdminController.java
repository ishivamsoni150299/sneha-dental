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
               or lower(c.public_config ->> 'hostedDomain') = lower(?) limit 1
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

    @GetMapping("/clinics/pending")
    List<Map<String, Object>> pendingVerifications(@AuthenticationPrincipal Jwt jwt) {
        requireAdmin(jwt);
        return jdbcTemplate.queryForList("""
            SELECT c.id, c.name, c.marketplace_slug, c.created_at,
                   c.public_config ->> 'doctorName' AS doctor_name,
                   c.public_config ->> 'phone' AS phone,
                   c.public_config -> 'marketplaceProfile' ->> 'locality' AS locality,
                   c.public_config -> 'marketplaceProfile' ->> 'region' AS region,
                   pv.evidence::text AS verification_evidence,
                   pv.status AS verification_status
            FROM clinics c
            LEFT JOIN provider_verifications pv ON pv.clinic_id = c.id
            WHERE c.marketplace_status = 'pending'
            ORDER BY c.created_at ASC
            """);
    }

    @PostMapping("/clinics/{clinicId}/verify")
    @Transactional
    ResponseEntity<Map<String, Object>> verifyClinic(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable UUID clinicId
    ) {
        requireAdmin(jwt);
        UUID reviewerId = UUID.fromString(jwt.getSubject());
        int updated = jdbcTemplate.update("""
            UPDATE clinics SET marketplace_status = 'verified',
                public_config = jsonb_set(public_config, '{marketplaceVerifiedAt}', to_jsonb(now()::text), true),
                updated_at = now()
            WHERE id = ? AND marketplace_status = 'pending'
            """, clinicId);
        if (updated != 1) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "This clinic is not in pending status.");
        }
        jdbcTemplate.update("""
            INSERT INTO provider_verifications (clinic_id, status, reviewed_by, reviewed_at)
            VALUES (?, 'verified', ?, now())
            ON CONFLICT (clinic_id) DO UPDATE SET
                status = 'verified', reviewed_by = ?, reviewed_at = now(), updated_at = now()
            """, clinicId, reviewerId, reviewerId);
        jdbcTemplate.update("""
            INSERT INTO provider_verification_events (clinic_id, reviewer_id, status)
            VALUES (?, ?, 'verified')
            """, clinicId, reviewerId);
        return ResponseEntity.ok(Map.of("status", "verified", "clinicId", clinicId.toString()));
    }

    @PostMapping("/clinics/{clinicId}/reject")
    @Transactional
    ResponseEntity<Map<String, Object>> rejectClinic(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable UUID clinicId,
        @RequestBody Map<String, String> body
    ) {
        requireAdmin(jwt);
        UUID reviewerId = UUID.fromString(jwt.getSubject());
        String reason = body.getOrDefault("reason", "");
        int updated = jdbcTemplate.update("""
            UPDATE clinics SET marketplace_status = 'suspended', updated_at = now()
            WHERE id = ? AND marketplace_status IN ('pending', 'verified')
            """, clinicId);
        if (updated != 1) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "This clinic cannot be suspended from its current state.");
        }
        jdbcTemplate.update("""
            INSERT INTO provider_verifications (clinic_id, status, evidence, reviewed_by, reviewed_at)
            VALUES (?, 'suspended', jsonb_build_object('rejectionReason', ?), ?, now())
            ON CONFLICT (clinic_id) DO UPDATE SET
                status = 'suspended', evidence = provider_verifications.evidence || jsonb_build_object('rejectionReason', ?),
                reviewed_by = ?, reviewed_at = now(), updated_at = now()
            """, clinicId, reason, reviewerId, reason, reviewerId);
        jdbcTemplate.update("""
            INSERT INTO provider_verification_events (clinic_id, reviewer_id, status, data)
            VALUES (?, ?, 'suspended', jsonb_build_object('reason', ?))
            """, clinicId, reviewerId, reason);
        return ResponseEntity.ok(Map.of("status", "suspended", "clinicId", clinicId.toString()));
    }

    @GetMapping("/providers/pending")
    List<Map<String, Object>> pendingProviders(@AuthenticationPrincipal Jwt jwt) {
        requireAdmin(jwt);
        return jdbcTemplate.queryForList("""
            SELECT p.id, p.slug, p.full_name, p.qualification, p.speciality,
                   p.experience_years, p.registration_number, p.registration_council,
                   p.phone_e164, p.photo_url, p.languages::text AS languages, p.created_at,
                   count(m.location_id) AS active_location_count
            FROM providers p
            LEFT JOIN provider_location_memberships m
              ON m.provider_id = p.id AND m.status = 'active'
            WHERE p.verification_status = 'pending'
            GROUP BY p.id
            ORDER BY p.created_at ASC
            """);
    }

    @PostMapping("/providers/{providerId}/verify")
    @Transactional
    ResponseEntity<Map<String, Object>> verifyProvider(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable UUID providerId
    ) {
        requireAdmin(jwt);
        UUID reviewerId = UUID.fromString(jwt.getSubject());
        int updated = jdbcTemplate.update("""
            UPDATE providers SET verification_status = 'verified', verified_at = now(), updated_at = now()
            WHERE id = ? AND verification_status = 'pending'
              AND qualification IS NOT NULL AND speciality IS NOT NULL
              AND registration_number IS NOT NULL AND registration_council IS NOT NULL
              AND EXISTS (
                  SELECT 1 FROM provider_location_memberships m
                  WHERE m.provider_id = providers.id AND m.status = 'active'
              )
            """, providerId);
        if (updated != 1) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "The dentist is not pending or the required evidence is incomplete.");
        }
        jdbcTemplate.update("""
            UPDATE provider_marketplace_listings
            SET publication_status = 'published', published_at = now(), updated_at = now()
            WHERE provider_id = ?
            """, providerId);
        jdbcTemplate.update("""
            INSERT INTO provider_verification_reviews (provider_id, reviewer_id, decision)
            VALUES (?, ?, 'verified')
            """, providerId, reviewerId);
        return ResponseEntity.ok(Map.of("status", "verified", "providerId", providerId.toString()));
    }

    @PostMapping("/providers/{providerId}/reject")
    @Transactional
    ResponseEntity<Map<String, Object>> rejectProvider(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable UUID providerId,
        @RequestBody Map<String, String> body
    ) {
        requireAdmin(jwt);
        UUID reviewerId = UUID.fromString(jwt.getSubject());
        String reason = body.getOrDefault("reason", "").trim();
        if (reason.length() > 1000) reason = reason.substring(0, 1000);
        int updated = jdbcTemplate.update("""
            UPDATE providers SET verification_status = 'rejected', verified_at = null, updated_at = now()
            WHERE id = ? AND verification_status = 'pending'
            """, providerId);
        if (updated != 1) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "The dentist is not pending verification.");
        }
        jdbcTemplate.update("""
            UPDATE provider_marketplace_listings
            SET publication_status = 'unlisted', published_at = null, updated_at = now()
            WHERE provider_id = ?
            """, providerId);
        jdbcTemplate.update("""
            INSERT INTO provider_verification_reviews (provider_id, reviewer_id, decision, reason)
            VALUES (?, ?, 'rejected', ?)
            """, providerId, reviewerId, reason);
        return ResponseEntity.ok(Map.of("status", "rejected", "providerId", providerId.toString()));
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
        if (!com.mydentalplatform.auth.UserRole.PLATFORM_ADMIN.claimValue().equals(jwt.getClaimAsString("role"))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Platform administrator access is required.");
        }
    }

    private Map<String, Object> defaultCosts() {
        return new LinkedHashMap<>(Map.of("hosting", 0, "database", 0, "domain", 0, "other", 0));
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
