package com.mydentalplatform;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import static org.junit.jupiter.api.Assertions.*;

/** Runs the real HTTP/security/SQL stack against a disposable database; never uses deployment credentials. */
class MarketplaceLaunchTest {
    private final ObjectMapper json = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private String base;

    @Test
    void freshDatabaseSupportsMarketplaceAndClinicAccounts() throws Exception {
        try (var postgres = EmbeddedPostgres.builder().setPort(0).start()) {
            var database = new JdbcTemplate(postgres.getPostgresDatabase());
            database.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto");
            // Historical V16 revokes privileges from the hosting provider's public API roles.
            // Keep applied migrations immutable; provision the same NOLOGIN roles on plain PostgreSQL.
            database.execute("CREATE ROLE anon NOLOGIN");
            database.execute("CREATE ROLE authenticated NOLOGIN");
            String password = "Launch-" + UUID.randomUUID();
            try (var app = SpringApplication.run(PlatformApplication.class,
                "--server.port=0", "--spring.profiles.active=production",
                "--spring.datasource.url=" + postgres.getJdbcUrl("postgres", "postgres"),
                "--spring.datasource.username=postgres", "--spring.datasource.password=",
                "--platform.public-base-url=https://marketplace.example.test",
                "--platform.auth.issuer=https://marketplace.example.test",
                "--platform.auth.secret=" + UUID.randomUUID() + UUID.randomUUID(),
                "--platform.auth.test-phone-otp-enabled=false",
                "--platform.bootstrap-admin.email=launch-admin@example.test",
                "--platform.bootstrap-admin.password=" + password,
                "--platform.email.resend-api-key=", "--platform.billing.razorpay-key-id=",
                "--platform.billing.razorpay-key-secret=", "--platform.billing.razorpay-webhook-secret=",
                "--VIDEO_PROVIDER=daily", "--DAILY_API_KEY=")) {
                base = "http://127.0.0.1:" + app.getEnvironment().getRequiredProperty("local.server.port");
                assertEquals(0, app.getBean(Flyway.class).info().pending().length);
                assertEquals("ok", request("GET", "/api/health", null, null, 200).path("status").asText());
                request("GET", "/api/auth/me", null, null, 401);
                request("GET", "/api/marketplace/clinics?region=Delhi", null, null, 200);

                String admin = token(request("POST", "/api/auth/login", Map.of("email", "launch-admin@example.test", "password", password), null, 200));
                String patient = token(request("POST", "/api/auth/patient/signup", Map.of("email", "patient@example.test", "password", password), null, 200));
                request("GET", "/api/admin/clinics", null, patient, 403);
                request("GET", "/api/patient/account/session", null, patient, 200);
                request("GET", "/api/patient/account/missing", null, patient, 404);
                request("GET", "/api/admin/clinics", null, admin, 200);

                String owner = token(request("POST", "/api/auth/clinic/signup", Map.of("email", "owner@example.test", "password", password), null, 200));
                JsonNode clinic = request("POST", "/api/clinics/onboarding", Map.of("name", "Launch Dental", "phone", "9999999999", "slug", "launch-dental", "plan", "trial", "city", "Delhi"), owner, 200);
                assertFalse(clinic.path("clinicId").asText().isBlank());
                // Onboarding changes the role; stale tokens must stop working before a fresh login.
                request("GET", "/api/clinics/current", null, owner, 401);
                owner = token(request("POST", "/api/auth/login", Map.of("email", "owner@example.test", "password", password), null, 200));
                assertEquals(clinic.path("clinicId").asText(), request("GET", "/api/clinics/current", null, owner, 200).path("id").asText());
                request("GET", "/api/admin/clinics", null, owner, 403);
                request("GET", "/api/clinics/current/appointments", null, owner, 200);
                request("GET", "/api/clinics/current/patients", null, owner, 200);
                request("GET", "/api/clinics/current/patients?search=missing", null, owner, 200);

                var schedule = new java.util.LinkedHashMap<String, Object>();
                for (String day : java.util.List.of("mon", "tue", "wed", "thu", "fri", "sat", "sun"))
                    schedule.put(day, Map.of("enabled", true, "start", "09:00", "end", "17:00"));
                String doctor = request("POST", "/api/clinics/current/doctors", Map.of("name", "Launch Dentist", "qualification", "BDS", "speciality", "General Dentistry", "available", true, "schedule", schedule), owner, 200).path("id").asText();
                String date = java.time.LocalDate.now(java.time.ZoneId.of("Asia/Kolkata")).plusDays(3).toString();
                String clinicId = clinic.path("clinicId").asText();
                assertTrue(request("GET", "/api/public/clinics/" + clinicId + "/doctors/" + doctor + "/slots?date=" + date, null, null, 200).size() > 0);
                var booking = new java.util.LinkedHashMap<String, Object>();
                booking.put("clinicId", clinicId); booking.put("doctorId", doctor);
                booking.put("name", "Launch Patient"); booking.put("phone", "9999999998");
                booking.put("service", "General Dentistry"); booking.put("source", "marketplace");
                booking.put("date", date); booking.put("time", "09:00");
                var heldSlot = Map.of("clinicId", clinicId, "doctorId", doctor, "date", date, "time", "09:00");
                String hold = request("POST", "/api/public/appointments/hold-slot", heldSlot, null, 200).path("holdToken").asText();
                request("POST", "/api/public/appointments/hold-slot", heldSlot, null, 409);
                // A competing checkout cannot bypass a reservation by omitting or inventing a token.
                request("POST", "/api/public/appointments", booking, patient, 409);
                booking.put("holdToken", "not-the-reservation-token");
                request("POST", "/api/public/appointments", booking, patient, 409);
                // A valid token is only valid for its original doctor/date/time.
                booking.put("holdToken", hold);
                booking.put("time", "09:30");
                request("POST", "/api/public/appointments", booking, patient, 409);
                booking.put("time", "09:00");
                request("POST", "/api/public/appointments", booking, patient, 200);
                request("POST", "/api/public/appointments", booking, patient, 409);
                request("POST", "/api/public/appointments/hold-slot", heldSlot, null, 409);
                JsonNode visits = request("GET", "/api/patient/account/session", null, patient, 200).path("appointments");
                assertEquals(1, visits.size(), "A duplicate request must not leave a partial booking");
                var jdbc = app.getBean(JdbcTemplate.class);
                UUID appointmentId = jdbc.queryForObject("select id from appointments where clinic_id = ?", UUID.class, UUID.fromString(clinicId));
                var reservedNext = Map.of("clinicId", clinicId, "doctorId", doctor, "date", date, "time", "09:30");
                String nextHold = request("POST", "/api/public/appointments/hold-slot", reservedNext, null, 200).path("holdToken").asText();
                request("PATCH", "/api/clinics/current/appointments/" + appointmentId + "/reschedule",
                    Map.of("doctorId", doctor, "date", date, "time", "09:30"), owner, 409);
                request("PATCH", "/api/patient/account/appointments/" + appointmentId,
                    Map.of("phone", "9999999998", "date", date, "time", "09:30"), patient, 409);
                assertEquals("09:00", jdbc.queryForObject("select to_char(appointment_time, 'HH24:MI') from appointments where id = ?", String.class, appointmentId));
                jdbc.update("update appointment_slot_holds set expires_at = now() - interval '1 minute' where hold_token = ?", nextHold);
                booking.put("time", "09:30");
                booking.put("holdToken", nextHold);
                request("POST", "/api/public/appointments", booking, patient, 409);
                String renewedHold = request("POST", "/api/public/appointments/hold-slot", reservedNext, null, 200).path("holdToken").asText();
                assertNotEquals(nextHold, renewedHold);
                request("DELETE", "/api/public/appointments/hold-slot/" + renewedHold, null, null, 204);
                assertEquals(0, jdbc.queryForObject("select count(*) from appointment_slot_holds where hold_token = ?", Integer.class, renewedHold));
                var notifications = app.getBean(com.mydentalplatform.notification.NotificationService.class);
                var transaction = new org.springframework.transaction.support.TransactionTemplate(app.getBean(org.springframework.transaction.PlatformTransactionManager.class));
                transaction.executeWithoutResult(status -> {
                    notifications.notifyPatientStatusUpdate(UUID.fromString(clinicId), appointmentId, "LAUNCH", "Patient", "patient@example.test", "reminder", java.time.LocalDate.parse(date), java.time.LocalTime.of(9, 0), null);
                    status.setRollbackOnly();
                });
                assertEquals(0, jdbc.queryForObject("select count(*) from notification_outbox where appointment_id = ?", Integer.class, appointmentId));
                for (int attempt = 0; attempt < 2; attempt++)
                    notifications.notifyPatientStatusUpdate(UUID.fromString(clinicId), appointmentId, "LAUNCH", "Patient", "patient@example.test", "reminder", java.time.LocalDate.parse(date), java.time.LocalTime.of(9, 0), null);
                assertEquals(1, jdbc.queryForObject("select count(*) from notification_outbox where appointment_id = ? and status = 'pending' and attempts = 0", Integer.class, appointmentId));
                // Exercise the real queue claim SQL while mocking only the external email transport.
                HttpClient emailHttp = org.mockito.Mockito.mock(HttpClient.class);
                @SuppressWarnings("unchecked") HttpResponse<String> delivered = org.mockito.Mockito.mock(HttpResponse.class);
                org.mockito.Mockito.when(delivered.statusCode()).thenReturn(200);
                org.mockito.Mockito.when(emailHttp.send(org.mockito.ArgumentMatchers.any(HttpRequest.class), org.mockito.ArgumentMatchers.<HttpResponse.BodyHandler<String>>any())).thenReturn(delivered);
                var worker = new com.mydentalplatform.notification.NotificationService(jdbc, json, "test-key", "sender@example.test", base, emailHttp);
                worker.retryFailedNotifications();
                worker.retryFailedNotifications();
                assertEquals(1, jdbc.queryForObject("select count(*) from notification_outbox where appointment_id = ? and status = 'sent' and attempts = 1", Integer.class, appointmentId));
                var emailRequest = org.mockito.ArgumentCaptor.forClass(HttpRequest.class);
                org.mockito.Mockito.verify(emailHttp, org.mockito.Mockito.atLeastOnce()).send(emailRequest.capture(), org.mockito.ArgumentMatchers.<HttpResponse.BodyHandler<String>>any());
                assertTrue(emailRequest.getValue().headers().firstValue("Idempotency-Key").isPresent());
                String stranger = token(request("POST", "/api/auth/patient/signup", Map.of("email", "stranger@example.test", "password", password), null, 200));
                assertEquals(0, request("GET", "/api/patient/account/session", null, stranger, 200).path("appointments").size());

                String dentist = token(request("POST", "/api/auth/professional/signup", Map.of("email", "dentist@example.test", "password", password, "fullName", "Independent Dentist"), null, 200));
                request("GET", "/api/providers/me", null, dentist, 200);
                request("GET", "/api/providers/me/appointments", null, dentist, 200);
                request("GET", "/api/admin/clinics", null, dentist, 403);
                request("GET", "/api/providers/me", null, patient, 403);
                request("GET", "/api/v1/providers", null, null, 200);
            }
        }
    }

    private String token(JsonNode response) {
        String value = response.path("accessToken").asText();
        assertFalse(value.isBlank(), "Authentication must return an access token");
        return value;
    }

    private JsonNode request(String method, String path, Object body, String token, int expected) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create(base + path)).timeout(Duration.ofSeconds(30));
        if (token != null) builder.header("Authorization", "Bearer " + token);
        builder.header("Content-Type", "application/json");
        builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)));
        var response = http.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        // Do not put tokens, cookies, passwords, or patient payloads into assertion messages.
        assertEquals(expected, response.statusCode(), method + " " + path);
        return response.body().isBlank() || !response.headers().firstValue("Content-Type").orElse("").contains("json")
            ? json.createObjectNode() : json.readTree(response.body());
    }
}
