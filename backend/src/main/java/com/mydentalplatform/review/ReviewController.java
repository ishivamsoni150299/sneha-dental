package com.mydentalplatform.review;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

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
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
public class ReviewController {
    private final JdbcTemplate jdbcTemplate;

    public ReviewController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @GetMapping("/admin/reviews/moderation")
    List<Map<String, Object>> moderation(@AuthenticationPrincipal Jwt jwt) {
        requirePlatformAdmin(jwt);
        return jdbcTemplate.query("""
            select * from appointment_reviews where moderation_status = 'pending'
            order by created_at asc limit 100
            """, (resultSet, rowNumber) -> review(resultSet));
    }

    @PatchMapping("/admin/reviews/{reviewId}/moderation")
    ResponseEntity<Void> moderate(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable UUID reviewId,
        @Valid @RequestBody ModerationRequest request
    ) {
        requirePlatformAdmin(jwt);
        int updated = jdbcTemplate.update("""
            update appointment_reviews
            set moderation_status = cast(? as review_status),
                published_at = case when ? = 'published' then now() else null end,
                reviewed_by = ?, reviewed_at = now(), updated_at = now()
            where id = ? and moderation_status = 'pending'
            """, request.status(), request.status(), UUID.fromString(jwt.getSubject()), reviewId);
        if (updated != 1) throw new ResponseStatusException(HttpStatus.CONFLICT,
            "Review moderation record is unavailable.");
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/admin/reviews/reports")
    List<Map<String, Object>> reports(@AuthenticationPrincipal Jwt jwt) {
        requirePlatformAdmin(jwt);
        return jdbcTemplate.query("""
            select rr.*, r.clinic_id, r.rating, r.review_text, r.patient_alias,
                   r.moderation_status, r.clinic_response, r.created_at as review_created_at,
                   r.published_at
            from appointment_review_reports rr
            left join appointment_reviews r on r.id = rr.review_id
            where rr.status = 'pending' order by rr.created_at asc limit 100
            """, (resultSet, rowNumber) -> report(resultSet));
    }

    @PatchMapping("/admin/reviews/reports/{reportId}")
    @Transactional
    ResponseEntity<Void> resolveReport(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable UUID reportId,
        @Valid @RequestBody ReportRequest request
    ) {
        requirePlatformAdmin(jwt);
        UUID reviewerId = UUID.fromString(jwt.getSubject());
        List<UUID> reviews = jdbcTemplate.queryForList("""
            select review_id from appointment_review_reports where id = ? and status = 'pending' for update
            """, UUID.class, reportId);
        if (reviews.isEmpty()) throw new ResponseStatusException(HttpStatus.CONFLICT,
            "This report is no longer pending.");
        if (request.rejectReview()) {
            jdbcTemplate.update("""
                update appointment_reviews set moderation_status = 'rejected', published_at = null,
                    reviewed_by = ?, reviewed_at = now(), updated_at = now() where id = ?
                """, reviewerId, reviews.getFirst());
        }
        jdbcTemplate.update("""
            update appointment_review_reports set status = ?, reviewed_by = ?, reviewed_at = now(),
                updated_at = now() where id = ?
            """, request.status(), reviewerId, reportId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/clinics/current/reviews")
    List<Map<String, Object>> clinicReviews(@AuthenticationPrincipal Jwt jwt) {
        return jdbcTemplate.query("""
            select * from appointment_reviews where clinic_id = ? and moderation_status = 'published'
            order by published_at desc limit 100
            """, (resultSet, rowNumber) -> review(resultSet), clinicId(jwt));
    }

    @PatchMapping("/clinics/current/reviews/{reviewId}/response")
    ResponseEntity<Void> respond(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable UUID reviewId,
        @Valid @RequestBody ResponseRequest request
    ) {
        int updated = jdbcTemplate.update("""
            update appointment_reviews set clinic_response = ?, clinic_responded_at = now(), updated_at = now()
            where id = ? and clinic_id = ? and moderation_status = 'published'
            """, request.response().trim(), reviewId, clinicId(jwt));
        if (updated != 1) throw new ResponseStatusException(HttpStatus.NOT_FOUND,
            "This published review is unavailable.");
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/public/appointments/{appointmentId}/review")
    @Transactional
    Map<String, Object> submitPublicReview(
        @PathVariable UUID appointmentId,
        @Valid @RequestBody PublicReviewRequest request
    ) {
        List<Map<String, Object>> appointments = jdbcTemplate.queryForList("""
            select clinic_id, patient_name, phone_e164 from appointments
            where id = ? and status = 'completed'
              and right(regexp_replace(phone_e164, '[^0-9]', '', 'g'), 10) = ?
            for update
            """, appointmentId, normalizePhone(request.phone()));
        if (appointments.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,
            "A completed appointment matching this phone number was not found.");
        Map<String, Object> appointment = appointments.getFirst();
        UUID patientId = patientId(String.valueOf(appointment.get("phone_e164")));
        UUID reviewId = UUID.randomUUID();
        String patientName = String.valueOf(appointment.get("patient_name"));
        String alias = request.anonymous() ? "Anonymous patient" : patientName.split("\\s+")[0];
        try {
            jdbcTemplate.update("""
                insert into appointment_reviews (
                    id, appointment_id, clinic_id, patient_id, rating, review_text, patient_alias
                ) values (?, ?, ?, ?, ?, ?, ?)
                """, reviewId, appointmentId, appointment.get("clinic_id"), patientId,
                request.rating(), request.text() == null ? "" : request.text().trim(), alias);
        } catch (org.springframework.dao.DuplicateKeyException error) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This appointment has already been reviewed.", error);
        }
        jdbcTemplate.update("update appointments set patient_id = ? where id = ?", patientId, appointmentId);
        return jdbcTemplate.queryForObject("select * from appointment_reviews where id = ?",
            (resultSet, rowNumber) -> review(resultSet), reviewId);
    }

    @PostMapping("/public/reviews/{reviewId}/reports")
    @Transactional
    ResponseEntity<Void> reportPublicReview(
        @PathVariable UUID reviewId,
        @Valid @RequestBody PublicReportRequest request
    ) {
        String phone = "+91" + normalizePhone(request.phone());
        List<UUID> eligibleClinics = jdbcTemplate.queryForList("""
            select distinct r.clinic_id from appointment_reviews r
            join appointments a on a.clinic_id = r.clinic_id
            where r.id = ? and a.status = 'completed'
              and right(regexp_replace(a.phone_e164, '[^0-9]', '', 'g'), 10) = ?
            """, UUID.class, reviewId, normalizePhone(phone));
        if (eligibleClinics.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,
            "A completed appointment is required to report this review.");
        UUID reporterId = patientId(phone);
        try {
            jdbcTemplate.update("""
                insert into appointment_review_reports (review_id, reporter_id, reason, details)
                values (?, ?, ?, ?)
                """, reviewId, reporterId, request.reason(), request.details() == null ? "" : request.details().trim());
        } catch (org.springframework.dao.DuplicateKeyException error) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "You have already reported this review.", error);
        }
        return ResponseEntity.noContent().build();
    }

    private UUID patientId(String phone) {
        return jdbcTemplate.queryForObject("""
            insert into users (role, phone_e164, phone_verified)
            values ('patient', ?, false)
            on conflict (phone_e164) do update set updated_at = now()
            returning id
            """, UUID.class, phone);
    }

    private String normalizePhone(String phone) {
        String digits = phone == null ? "" : phone.replaceAll("[^0-9]", "");
        if (digits.length() < 10) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A valid phone is required.");
        return digits.substring(digits.length() - 10);
    }

    private Map<String, Object> review(ResultSet resultSet) throws SQLException {
        Map<String, Object> review = new LinkedHashMap<>();
        review.put("id", resultSet.getObject("id", UUID.class).toString());
        review.put("clinicId", resultSet.getObject("clinic_id", UUID.class).toString());
        review.put("rating", resultSet.getInt("rating"));
        review.put("text", resultSet.getString("review_text"));
        review.put("patientAlias", resultSet.getString("patient_alias"));
        review.put("moderationStatus", resultSet.getString("moderation_status"));
        review.put("clinicResponse", resultSet.getString("clinic_response"));
        review.put("createdAt", instant(resultSet, "created_at"));
        review.put("publishedAt", instant(resultSet, "published_at"));
        return review;
    }

    private Map<String, Object> report(ResultSet resultSet) throws SQLException {
        Map<String, Object> report = new LinkedHashMap<>();
        UUID clinicId = resultSet.getObject("clinic_id", UUID.class);
        report.put("id", resultSet.getObject("id", UUID.class).toString());
        report.put("reviewId", resultSet.getObject("review_id", UUID.class).toString());
        report.put("clinicId", clinicId == null ? "" : clinicId.toString());
        report.put("reason", resultSet.getString("reason"));
        report.put("details", resultSet.getString("details"));
        report.put("status", resultSet.getString("status"));
        report.put("createdAt", instant(resultSet, "created_at"));
        if (clinicId == null) {
            report.put("review", null);
        } else {
            Map<String, Object> review = new LinkedHashMap<>();
            review.put("id", resultSet.getObject("review_id", UUID.class).toString());
            review.put("clinicId", clinicId.toString());
            review.put("rating", resultSet.getInt("rating"));
            review.put("text", resultSet.getString("review_text"));
            review.put("patientAlias", resultSet.getString("patient_alias"));
            review.put("moderationStatus", resultSet.getString("moderation_status"));
            review.put("clinicResponse", resultSet.getString("clinic_response"));
            review.put("createdAt", instant(resultSet, "review_created_at"));
            review.put("publishedAt", instant(resultSet, "published_at"));
            report.put("review", review);
        }
        return report;
    }

    private void requirePlatformAdmin(Jwt jwt) {
        if (!"platform_admin".equals(jwt.getClaimAsString("role"))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Platform administrator access is required.");
        }
    }

    private UUID clinicId(Jwt jwt) {
        String value = jwt.getClaimAsString("clinic_id");
        if (value == null) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Clinic access is required.");
        return UUID.fromString(value);
    }

    private String instant(ResultSet resultSet, String column) throws SQLException {
        OffsetDateTime value = resultSet.getObject(column, OffsetDateTime.class);
        return value == null ? null : value.toInstant().toString();
    }

    record ModerationRequest(@Pattern(regexp = "published|rejected") String status) {}
    record ReportRequest(@Pattern(regexp = "resolved|dismissed") String status, boolean rejectReview) {}
    record ResponseRequest(@NotBlank @Size(min = 2, max = 600) String response) {}
    record PublicReviewRequest(
        @NotBlank String phone,
        @jakarta.validation.constraints.Min(1) @jakarta.validation.constraints.Max(5) int rating,
        @Size(max = 1200) String text,
        boolean anonymous
    ) {}
    record PublicReportRequest(
        @NotBlank String phone,
        @Pattern(regexp = "privacy|abuse|misleading|other") String reason,
        @Size(max = 500) String details
    ) {}
}