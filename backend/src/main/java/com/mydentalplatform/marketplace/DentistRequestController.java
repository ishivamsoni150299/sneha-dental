package com.mydentalplatform.marketplace;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class DentistRequestController {
    private final JdbcTemplate jdbc;
    public DentistRequestController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @PostMapping("/api/public/dentist-requests")
    @ResponseStatus(HttpStatus.CREATED)
    Map<String, String> create(@Valid @RequestBody Request request) {
        var date = request.preferredDate();
        if (date.isBefore(LocalDate.now(ZoneId.of("Asia/Kolkata"))) || date.isAfter(LocalDate.now(ZoneId.of("Asia/Kolkata")).plusYears(1)))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a preferred date within the next year.");
        UUID id = UUID.randomUUID();
        jdbc.update("""
            insert into patient_dentist_requests
              (id, location, problem, preferred_date, preferred_time, patient_name, mobile, email)
            values (?, ?, ?, ?, ?, ?, ?, ?)
            """, id, request.location().trim(), request.problem().trim(), date, request.preferredTime(),
            request.name().trim(), request.mobile(), request.email() == null || request.email().isBlank() ? null : request.email().trim());
        return Map.of("id", id.toString(), "status", "new");
    }

    @GetMapping("/api/admin/dentist-requests")
    List<Map<String, Object>> list(@AuthenticationPrincipal Jwt jwt) {
        requireAdmin(jwt);
        return jdbc.queryForList("select * from patient_dentist_requests order by created_at desc limit 200");
    }

    @PatchMapping("/api/admin/dentist-requests/{id}")
    void update(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody Update update) {
        requireAdmin(jwt);
        if (jdbc.update("update patient_dentist_requests set status = ? where id = ?", update.status(), id) != 1)
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Request not found.");
    }

    private void requireAdmin(Jwt jwt) {
        if (jwt == null || !"platform-admin".equals(jwt.getClaimAsString("role")))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Platform access required.");
    }

    record Update(@NotNull @Pattern(regexp = "new|contacted|closed") String status) {}
    record Request(@NotBlank @Size(max = 160) String location,
        @NotBlank @Size(max = 500) String problem, @NotNull LocalDate preferredDate,
        @NotNull LocalTime preferredTime, @NotBlank @Size(max = 160) String name,
        @NotNull @Pattern(regexp = "\\+91[6-9][0-9]{9}") String mobile,
        @Email @Size(max = 254) String email) {}
}
