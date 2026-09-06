package com.mydentalplatform.clinic;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.mydentalplatform.notification.NotificationService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
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
public class ContactController {
    private final JdbcTemplate jdbcTemplate;
    private final NotificationService notificationService;

    public ContactController(JdbcTemplate jdbcTemplate, NotificationService notificationService) {
        this.jdbcTemplate = jdbcTemplate;
        this.notificationService = notificationService;
    }

    @PostMapping("/public/contacts")
    public ResponseEntity<Void> create(@Valid @RequestBody ContactRequest request) {
        jdbcTemplate.update("""
            insert into contacts (clinic_id, name, phone, email, message, status, consent_version, consent_at)
            values (?, ?, ?, ?, ?, 'unread', ?, now())
            """, request.clinicId(), request.name().trim(), request.phone(), emptyToNull(request.email()),
            request.message().trim(), request.consentVersion());

        notificationService.notifyClinicNewContact(
            request.clinicId(),
            request.name().trim(),
            request.phone(),
            emptyToNull(request.email()),
            request.message().trim()
        );

        return ResponseEntity.accepted().build();
    }

    @GetMapping("/clinics/current/contacts")
    public List<Map<String, Object>> list(@AuthenticationPrincipal Jwt jwt) {
        UUID clinicId = clinicId(jwt);
        return jdbcTemplate.query("""
            select id, clinic_id, name, phone, email, message, status, consent_version, consent_at, created_at
            from contacts
            where clinic_id = ?
            order by created_at desc
            limit 200
            """, (resultSet, rowNumber) -> mapContact(resultSet), clinicId);
    }

    @PatchMapping("/clinics/current/contacts/{contactId}/status")
    public ResponseEntity<Void> updateStatus(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable UUID contactId,
        @Valid @RequestBody StatusUpdateRequest request
    ) {
        UUID clinicId = clinicId(jwt);
        int updated = jdbcTemplate.update("""
            update contacts set status = ?
            where id = ? and clinic_id = ?
            """, request.status(), contactId, clinicId);

        if (updated != 1) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Contact message not found.");
        }
        return ResponseEntity.noContent().build();
    }

    private Map<String, Object> mapContact(ResultSet rs) throws SQLException {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", rs.getObject("id", UUID.class).toString());
        map.put("clinicId", rs.getObject("clinic_id", UUID.class).toString());
        map.put("name", rs.getString("name"));
        map.put("phone", rs.getString("phone"));
        map.put("email", rs.getString("email"));
        map.put("message", rs.getString("message"));
        map.put("status", rs.getString("status"));
        map.put("consentVersion", rs.getString("consent_version"));
        OffsetDateTime consentAt = rs.getObject("consent_at", OffsetDateTime.class);
        map.put("consentAt", consentAt != null ? consentAt.toInstant().toString() : null);
        OffsetDateTime createdAt = rs.getObject("created_at", OffsetDateTime.class);
        map.put("createdAt", createdAt != null ? createdAt.toInstant().toString() : null);
        return map;
    }

    private UUID clinicId(Jwt jwt) {
        String value = jwt.getClaimAsString("clinic_id");
        if (value == null) throw new IllegalArgumentException("Clinic access is required.");
        return UUID.fromString(value);
    }

    private String emptyToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    public record ContactRequest(
        @NotNull UUID clinicId,
        @NotBlank @Size(min = 2, max = 120) String name,
        @NotBlank @Pattern(regexp = "^[6-9][0-9]{9}$") String phone,
        @Email @Size(max = 254) String email,
        @NotBlank @Size(min = 10, max = 2000) String message,
        @NotBlank @Size(max = 20) String consentVersion
    ) {
    }

    public record StatusUpdateRequest(
        @NotBlank @Pattern(regexp = "unread|read|responded|archived") String status
    ) {
    }
}