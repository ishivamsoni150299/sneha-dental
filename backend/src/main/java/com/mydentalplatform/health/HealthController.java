package com.mydentalplatform.health;

import java.time.Instant;
import java.util.Map;

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
    Map<String, Object> health() {
        Integer database = jdbcTemplate.queryForObject("select 1", Integer.class);
        return Map.of(
            "status", database != null && database == 1 ? "ok" : "degraded",
            "service", "mydentalplatform-java",
            "database", "postgresql",
            "timestamp", Instant.now().toString());
    }
}