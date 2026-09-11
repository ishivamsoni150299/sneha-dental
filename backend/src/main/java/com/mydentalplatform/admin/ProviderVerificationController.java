package com.mydentalplatform.admin;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/admin/providers")
public class ProviderVerificationController {
    private final JdbcTemplate jdbc;

    public ProviderVerificationController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @GetMapping("/pending")
    List<Map<String, Object>> pending(@AuthenticationPrincipal Jwt jwt) {
        requireAdmin(jwt);
        return jdbc.queryForList("""
            SELECT p.id, p.full_name, u.email, p.phone_e164, p.qualification,
                p.speciality, p.experience_years, p.registration_number, p.registration_council,
                p.biography, p.updated_at,
                (SELECT string_agg(l.name || ' — ' || l.address_line1 || ', ' || l.city, '; ' ORDER BY l.name)
                 FROM provider_location_memberships m JOIN practice_locations l ON l.id = m.location_id
                 WHERE m.provider_id = p.id AND m.status = 'active' AND l.active) AS locations
            FROM providers p LEFT JOIN users u ON u.id = p.user_id
            WHERE p.verification_status = 'pending'
            ORDER BY p.updated_at, p.id
            """);
    }

    @PostMapping("/{id}/verify")
    @Transactional
    public Map<String, Boolean> verify(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        requireAdmin(jwt);
        int changed = jdbc.update("""
            UPDATE providers p SET verification_status = 'verified', verified_at = now(), updated_at = now()
            WHERE p.id = ? AND p.verification_status = 'pending' AND p.active
                AND nullif(trim(p.qualification), '') IS NOT NULL
                AND nullif(trim(p.speciality), '') IS NOT NULL
                AND nullif(trim(p.registration_number), '') IS NOT NULL
                AND nullif(trim(p.registration_council), '') IS NOT NULL
                AND EXISTS (SELECT 1 FROM provider_location_memberships m
                    JOIN practice_locations l ON l.id = m.location_id
                    WHERE m.provider_id = p.id AND m.status = 'active' AND l.active)
            """, id);
        if (changed != 1) throw new ResponseStatusException(HttpStatus.CONFLICT,
            "Dentist is no longer pending or required profile details and an active location are missing.");
        jdbc.update("""
            INSERT INTO provider_marketplace_listings (provider_id, publication_status, published_at)
            VALUES (?, 'published', now()) ON CONFLICT (provider_id) DO UPDATE
            SET publication_status = 'published', published_at = now(), updated_at = now()
            """, id);
        recordReview(id, jwt, "verified", null);
        return Map.of("ok", true);
    }

    @PostMapping("/{id}/reject")
    @Transactional
    public Map<String, Boolean> reject(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
                                      @RequestBody Map<String, String> request) {
        requireAdmin(jwt);
        String reason = request.getOrDefault("reason", "");
        reason = reason == null ? "" : reason.trim();
        if (reason.isEmpty() || reason.length() > 1000) throw new ResponseStatusException(
            HttpStatus.BAD_REQUEST, "Enter a rejection reason between 1 and 1000 characters.");
        int changed = jdbc.update("""
            UPDATE providers SET verification_status = 'rejected', verified_at = null, updated_at = now()
            WHERE id = ? AND verification_status = 'pending'
            """, id);
        if (changed != 1) throw new ResponseStatusException(HttpStatus.CONFLICT, "Dentist is no longer pending.");
        jdbc.update("""
            UPDATE provider_marketplace_listings SET publication_status = 'unlisted',
                published_at = null, updated_at = now() WHERE provider_id = ?
            """, id);
        recordReview(id, jwt, "rejected", reason);
        return Map.of("ok", true);
    }

    private void recordReview(UUID id, Jwt jwt, String decision, String reason) {
        jdbc.update("""
            INSERT INTO provider_verification_reviews (provider_id, reviewer_id, decision, reason)
            VALUES (?, ?, ?, ?)
            """, id, UUID.fromString(jwt.getSubject()), decision, reason);
    }

    private void requireAdmin(Jwt jwt) {
        if (jwt == null || !com.mydentalplatform.auth.UserRole.PLATFORM_ADMIN.claimValue().equals(jwt.getClaimAsString("role")))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Platform administrator access is required.");
    }
}
