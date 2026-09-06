package com.mydentalplatform.health;

import java.time.Instant;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/health")
public class HealthController {
    private final JdbcTemplate jdbcTemplate;

    public HealthController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> health() {
        try {
            Integer database = jdbcTemplate.queryForObject("select 1", Integer.class);
            boolean ok = database != null && database == 1;
            return ResponseEntity.status(ok ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE)
                .body(Map.of(
                    "status", ok ? "ok" : "degraded",
                    "service", "mydentalplatform-java",
                    "database", ok ? "postgresql" : "unreachable",
                    "timestamp", Instant.now().toString()));
        } catch (Exception error) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(Map.of(
                    "status", "down",
                    "service", "mydentalplatform-java",
                    "database", "unreachable",
                    "error", "Database connection failure",
                    "timestamp", Instant.now().toString()));
        }
    }
}
