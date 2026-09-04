package com.mydentalplatform.clinic;

import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/public/contacts")
public class ContactController {
    private final JdbcTemplate jdbcTemplate;

    public ContactController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @PostMapping
    ResponseEntity<Void> create(@Valid @RequestBody ContactRequest request) {
        jdbcTemplate.update("""
            insert into contacts (clinic_id, name, phone, email, message, consent_version, consent_at)
            values (?, ?, ?, ?, ?, ?, now())
            """, request.clinicId(), request.name().trim(), request.phone(), emptyToNull(request.email()),
            request.message().trim(), request.consentVersion());
        return ResponseEntity.accepted().build();
    }

    private String emptyToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    record ContactRequest(
        @NotNull UUID clinicId,
        @NotBlank @Size(min = 2, max = 120) String name,
        @Pattern(regexp = "^[6-9][0-9]{9}$") String phone,
        @Email @Size(max = 254) String email,
        @NotBlank @Size(min = 10, max = 2000) String message,
        @NotBlank @Size(max = 20) String consentVersion
    ) {
    }
}