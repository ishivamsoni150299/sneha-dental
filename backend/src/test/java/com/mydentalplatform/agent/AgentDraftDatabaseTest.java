package com.mydentalplatform.agent;

import com.mydentalplatform.clinic.ClinicOnboardingService;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import static org.junit.jupiter.api.Assertions.*;

class AgentDraftDatabaseTest {
    @Test void migrationAndConcurrentConfirmationsCreateExactlyOneClinic() throws Exception {
        try (var postgres = EmbeddedPostgres.builder().setPort(0).setServerConfig("search_path", "dental,public").start()) {
            var dataSource = postgres.getPostgresDatabase();
            var jdbc = new JdbcTemplate(dataSource);
            jdbc.execute("create extension if not exists pgcrypto");
            jdbc.execute("create role anon nologin"); jdbc.execute("create role authenticated nologin");
            Flyway.configure().dataSource(dataSource).schemas("dental").defaultSchema("dental")
                .locations("classpath:db/migration").load().migrate();
            var json = new ObjectMapper();
            var actions = new AgentActions(jdbc, json, new ClinicOnboardingService(jdbc, json));
            var transaction = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
            UUID user = UUID.randomUUID(), family = UUID.randomUUID();
            jdbc.update("insert into users(id, role, email) values (?, 'incomplete_signup', 'agent-owner@example.test')", user);
            var actor = Jwt.withTokenValue("test").header("alg", "HS256").subject(user.toString())
                .claim("sid", family.toString()).claim("role", "incomplete-signup").claim("email", "agent-owner@example.test").build();
            var draft = actions.prepare(json.readTree("{\"name\":\"Smile Agent\",\"phone\":\"9999999999\",\"city\":\"Delhi\",\"slug\":\"smileagent\"}"), actor);
            UUID id = UUID.fromString((String) draft.get("draftId"));
            assertEquals(0, jdbc.queryForObject("select count(*) from clinics where name = 'Smile Agent'", Integer.class));
            var otherSession = Jwt.withTokenValue("test").header("alg", "HS256").subject(user.toString())
                .claim("sid", UUID.randomUUID().toString()).claim("role", "incomplete-signup").build();
            assertThrows(ResponseStatusException.class, () -> transaction.execute(status -> actions.confirm(id, otherSession)));
            try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
                var first = executor.submit(() -> transaction.execute(status -> actions.confirm(id, actor)));
                var second = executor.submit(() -> transaction.execute(status -> actions.confirm(id, actor)));
                assertEquals(first.get(15, TimeUnit.SECONDS).get("clinicId"), second.get(15, TimeUnit.SECONDS).get("clinicId"));
            }
            assertEquals(1, jdbc.queryForObject("select count(*) from clinics where name = 'Smile Agent'", Integer.class));
            assertEquals("clinic_admin", jdbc.queryForObject("select role::text from users where id = ?", String.class, user));
            assertEquals("completed", jdbc.queryForObject("select status from agent_action_drafts where id = ?", String.class, id));
        }
    }
}
