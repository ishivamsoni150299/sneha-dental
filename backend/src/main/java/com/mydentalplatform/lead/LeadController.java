package com.mydentalplatform.lead;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

@RestController
@RequestMapping("/api/admin/leads")
public class LeadController {
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public LeadController(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    @GetMapping
    List<Map<String, Object>> list(@AuthenticationPrincipal Jwt jwt) {
        requirePlatformAdmin(jwt);
        return jdbcTemplate.query("select * from leads order by created_at desc",
            (resultSet, rowNumber) -> lead(resultSet));
    }

    @GetMapping("/{leadId}")
    ResponseEntity<Map<String, Object>> get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID leadId) {
        requirePlatformAdmin(jwt);
        return ResponseEntity.ofNullable(jdbcTemplate.query(
            "select * from leads where id = ?",
            resultSet -> resultSet.next() ? lead(resultSet) : null, leadId));
    }

    @PostMapping
    Map<String, String> create(@AuthenticationPrincipal Jwt jwt, @RequestBody Map<String, Object> request) {
        requirePlatformAdmin(jwt);
        require(request, "clinicName", "phone", "city", "status", "source");
        UUID id = UUID.randomUUID();
        jdbcTemplate.update("""
            insert into leads (id, name, phone_e164, email, status, source, data)
            values (?, ?, ?, ?, ?, ?, cast(? as jsonb))
            """, id, text(request.get("clinicName")), text(request.get("phone")),
            blankToNull(request.get("email")), text(request.get("status")), text(request.get("source")), json(request));
        return Map.of("id", id.toString());
    }

    @PatchMapping("/{leadId}")
    ResponseEntity<Void> update(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable UUID leadId,
        @RequestBody Map<String, Object> request
    ) {
        requirePlatformAdmin(jwt);
        int updated = jdbcTemplate.update("""
            update leads set
                name = coalesce(nullif(?, ''), name),
                phone_e164 = coalesce(nullif(?, ''), phone_e164),
                email = case when ? then ? else email end,
                status = coalesce(nullif(?, ''), status),
                source = coalesce(nullif(?, ''), source),
                data = data || cast(? as jsonb), updated_at = now()
            where id = ?
            """, text(request.get("clinicName")), text(request.get("phone")), request.containsKey("email"),
            blankToNull(request.get("email")), text(request.get("status")), text(request.get("source")),
            json(request), leadId);
        return updated == 1 ? ResponseEntity.noContent().build() : ResponseEntity.notFound().build();
    }

    @DeleteMapping("/{leadId}")
    ResponseEntity<Void> delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID leadId) {
        requirePlatformAdmin(jwt);
        int deleted = jdbcTemplate.update("delete from leads where id = ?", leadId);
        return deleted == 1 ? ResponseEntity.noContent().build() : ResponseEntity.notFound().build();
    }

    @GetMapping("/{leadId}/activities")
    List<Map<String, Object>> activities(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID leadId) {
        requirePlatformAdmin(jwt);
        return jdbcTemplate.query("""
            select id, activity_type, data::text as data, created_at from lead_activities
            where lead_id = ? order by created_at desc
            """, (resultSet, rowNumber) -> {
                Map<String, Object> data = parse(resultSet.getString("data"));
                Map<String, Object> activity = new LinkedHashMap<>(data);
                activity.put("id", resultSet.getObject("id", UUID.class).toString());
                activity.put("type", resultSet.getString("activity_type"));
                activity.put("createdAt", instant(resultSet, "created_at"));
                return activity;
            }, leadId);
    }

    @PostMapping("/{leadId}/activities")
    ResponseEntity<Void> addActivity(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable UUID leadId,
        @RequestBody Map<String, Object> request
    ) {
        requirePlatformAdmin(jwt);
        String type = text(request.get("type"));
        if (type.isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Activity type is required.");
        try {
            jdbcTemplate.update("""
                insert into lead_activities (lead_id, actor_id, activity_type, data)
                values (?, ?, ?, cast(? as jsonb))
                """, leadId, UUID.fromString(jwt.getSubject()), type, json(request));
        } catch (org.springframework.dao.DataIntegrityViolationException error) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Lead not found.", error);
        }
        return ResponseEntity.accepted().build();
    }

    private Map<String, Object> lead(ResultSet resultSet) throws SQLException {
        Map<String, Object> value = parse(resultSet.getString("data"));
        value.put("id", resultSet.getObject("id", UUID.class).toString());
        value.put("clinicName", resultSet.getString("name"));
        value.put("phone", resultSet.getString("phone_e164"));
        value.put("status", resultSet.getString("status"));
        value.put("source", resultSet.getString("source"));
        value.put("createdAt", instant(resultSet, "created_at"));
        return value;
    }

    private void requirePlatformAdmin(Jwt jwt) {
        if (!"platform_admin".equals(jwt.getClaimAsString("role"))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Platform administrator access is required.");
        }
    }

    private void require(Map<String, Object> request, String... keys) {
        for (String key : keys) {
            if (text(request.get(key)).isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, key + " is required.");
            }
        }
    }

    private String text(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    private String blankToNull(Object value) {
        String result = text(value);
        return result.isBlank() ? null : result;
    }

    private String json(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JacksonException error) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Lead data is invalid.", error);
        }
    }

    private Map<String, Object> parse(String value) {
        try {
            return new LinkedHashMap<>(objectMapper.readValue(value, new TypeReference<>() {}));
        } catch (JacksonException error) {
            throw new IllegalStateException("Lead data contains invalid JSON.", error);
        }
    }

    private String instant(ResultSet resultSet, String column) throws SQLException {
        OffsetDateTime value = resultSet.getObject(column, OffsetDateTime.class);
        return value == null ? null : value.toInstant().toString();
    }
}