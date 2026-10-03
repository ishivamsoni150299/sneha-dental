package com.mydentalplatform.billing;

import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class BillingCancellationTest {
    static EmbeddedPostgres postgres;
    static JdbcTemplate jdbc;
    static UUID legacyClinic;
    final ObjectMapper json = new ObjectMapper();
    HttpClient http;
    BillingService billing;
    UUID clinic;
    Map<String, Map<String, Object>> snapshots;
    List<Map<String, Object>> invoices;
    int creates;
    final long end = Instant.now().plusSeconds(86400 * 30).getEpochSecond();

    @BeforeAll static void database() throws Exception {
        postgres = EmbeddedPostgres.builder().setPort(0).setServerConfig("search_path", "dental,public").start();
        jdbc = new JdbcTemplate(postgres.getPostgresDatabase());
        jdbc.execute("create role anon nologin");
        jdbc.execute("create role authenticated nologin");
        Flyway.configure().dataSource(postgres.getPostgresDatabase()).schemas("dental").defaultSchema("dental").locations("classpath:db/migration").target("27").load().migrate();
        legacyClinic = UUID.randomUUID();
        jdbc.update("insert into clinics (id, name) values (?, 'Legacy billing fixture')", legacyClinic);
        jdbc.update("""
            insert into appointments (clinic_id, booking_ref, patient_name, phone_e164, service, appointment_date, appointment_time, source, payment_status, amount_charged)
            select ?, ref, 'Legacy patient', '+919876543210', 'Cleaning', current_date, '10:00'::time, 'clinic_website', status, amount
            from (values ('L-PAID', 'paid', 500), ('L-NULL', 'unpaid', null), ('L-NEG', 'paid', -1), ('L-PART', 'partial', 1000)) as records(ref, status, amount)
            """, legacyClinic);
        Flyway.configure().dataSource(postgres.getPostgresDatabase()).schemas("dental").defaultSchema("dental").locations("classpath:db/migration").load().migrate();
    }
    @AfterAll static void close() throws Exception { if (postgres != null) postgres.close(); }
    @BeforeEach void setup() throws Exception {
        clinic = UUID.randomUUID();
        jdbc.update("insert into clinics (id, name) values (?, 'Billing test')", clinic);
        http = mock(HttpClient.class);
        snapshots = new HashMap<>();
        invoices = List.of();
        creates = 0;
        billing = new BillingService(jdbc, json, new DataSourceTransactionManager(jdbc.getDataSource()),
            "key", "secret", "webhook", "plan_basic", "plan_pro", "", http);
        when(http.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenAnswer(invocation -> {
            HttpRequest request = invocation.getArgument(0);
            String path = request.uri().getPath();
            Object body;
            if (path.contains("/plans/")) {
                boolean pro = path.endsWith("plan_pro");
                body = Map.of("id", pro ? "plan_pro" : "plan_basic", "period", "monthly", "interval", 1,
                    "item", Map.of("amount", pro ? 249900 : 99900, "currency", "INR"));
            } else if (path.equals("/v1/invoices")) {
                body = Map.of("items", invoices);
            } else if (path.equals("/v1/subscriptions")) {
                creates++;
                var attempt = jdbc.queryForMap("select * from subscriptions where clinic_id = ? and status = 'creating'", clinic);
                var snapshot = snapshot("sub_" + UUID.randomUUID().toString().replace("-", ""), "created", (String) attempt.get("plan"));
                snapshot.put("notes", Map.of("clinicId", clinic.toString(), "checkoutId", attempt.get("id").toString(), "plan", attempt.get("plan"), "billingCycle", "monthly"));
                snapshots.put((String) snapshot.get("id"), snapshot);
                body = snapshot;
            } else {
                String id = path.split("/")[3];
                body = snapshots.get(id);
                if (body == null) throw new AssertionError("Unexpected provider request " + request.uri());
            }
            HttpResponse<String> response = mock(HttpResponse.class);
            when(response.statusCode()).thenReturn(200);
            when(response.body()).thenReturn(json.writeValueAsString(body));
            return response;
        });
    }
    Map<String, Object> snapshot(String id, String status, String plan) {
        var result = new LinkedHashMap<String, Object>();
        result.put("id", id); result.put("status", status);
        result.put("plan_id", plan.equals("pro") ? "plan_pro" : "plan_basic");
        result.put("short_url", "https://rzp.io/" + id);
        result.put("notes", Map.of("clinicId", clinic.toString(), "plan", plan, "billingCycle", "monthly"));
        result.put("paid_count", status.equals("active") || status.equals("cancelled") ? 1 : 0);
        result.put("current_start", Instant.now().getEpochSecond());
        result.put("current_end", status.equals("created") ? null : end);
        return result;
    }
    String create() { return (String) billing.create(clinic, "starter", "monthly").get("subscriptionId"); }
    String body(String event, String id, Map<String, Object> payment) {
        return json.writeValueAsString(Map.of("event", event, "payload", Map.of(
            "subscription", Map.of("entity", snapshots.get(id)), "payment", Map.of("entity", payment))));
    }
    String signature(String raw) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec("webhook".getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return HexFormat.of().formatHex(mac.doFinal(raw.getBytes(StandardCharsets.UTF_8)));
    }
    Map<String, Object> send(String event, String id, String eventId, Map<String, Object> payment) throws Exception {
        String raw = body(event, id, payment);
        return billing.webhook(signature(raw), eventId, raw);
    }
    String status() { return (String) billing.current(clinic).get("status"); }

    @Test void checkoutIsReusedAndDoesNotActivateBeforePayment() {
        String first = create();
        assertEquals(first, create());
        assertEquals(1, creates);
        assertNotEquals("active", status());
        assertEquals(1, jdbc.queryForObject("select count(*) from subscriptions where clinic_id = ?", Integer.class, clinic));
    }

    @Test void migrationPreservesUnknownHistoricalPaymentsWithoutInventingAmounts() {
        assertEquals(0, new java.math.BigDecimal("500").compareTo(jdbc.queryForObject("select amount_paid from appointments where booking_ref = 'L-PAID'", java.math.BigDecimal.class)));
        assertEquals(3, jdbc.queryForObject("select count(*) from appointments where clinic_id = ? and amount_paid is null", Integer.class, legacyClinic));
    }
    @Test void differentPlanCannotCreateAnotherMandate() {
        create();
        assertEquals(409, assertThrows(ResponseStatusException.class, () -> billing.create(clinic, "pro", "monthly")).getStatusCode().value());
        assertEquals(1, creates);
    }
    @Test void activationAndRenewalStorePeriodAndCapturedPaymentOnce() throws Exception {
        String id = create();
        snapshots.put(id, snapshot(id, "active", "starter"));
        var payment = Map.<String, Object>of("id", "pay_" + clinic.toString().replace("-", ""), "status", "captured", "currency", "INR", "amount", 99900, "created_at", Instant.now().getEpochSecond());
        String eventId = UUID.randomUUID().toString();
        send("subscription.charged", id, eventId, payment);
        assertEquals("active", status());
        assertNotNull(billing.current(clinic).get("currentPeriodEnd"));
        assertEquals(true, send("subscription.charged", id, eventId, payment).get("duplicate"));
        send("subscription.charged", id, UUID.randomUUID().toString(), payment);
        assertEquals(1, jdbc.queryForObject("select count(*) from billing_payments where clinic_id = ?", Integer.class, clinic));
        assertNotNull(jdbc.queryForObject("select public_config ->> 'subscriptionEndDate' from clinics where id = ?", String.class, clinic));
    }
    @Test void outOfOrderWebhookUsesCurrentProviderState() throws Exception {
        String id = create();
        String old = body("subscription.authenticated", id, Map.of());
        snapshots.put(id, snapshot(id, "active", "starter"));
        billing.webhook(signature(old), UUID.randomUUID().toString(), old);
        assertEquals("active", status());
    }
    @Test void invalidSignatureCannotChangeData() {
        assertEquals(400, assertThrows(ResponseStatusException.class, () -> billing.webhook("bad", "bad", "{}")).getStatusCode().value());
        assertEquals("trial", status());
    }
    @Test void mismatchedClinicCannotActivateAndEventCanBeRetried() throws Exception {
        String id = create();
        snapshots.get(id).put("notes", Map.of("clinicId", UUID.randomUUID().toString(), "plan", "starter", "billingCycle", "monthly"));
        String raw = body("subscription.activated", id, Map.of());
        assertThrows(ResponseStatusException.class, () -> billing.webhook(signature(raw), "mismatch", raw));
        assertNotEquals("active", status());
    }
    @Test void missingCapturedPaymentRollsBackActivationAndEvent() throws Exception {
        String id = create();
        snapshots.put(id, snapshot(id, "active", "starter"));
        assertThrows(ResponseStatusException.class, () -> send("subscription.charged", id, "missing-payment", Map.of()));
        assertNotEquals("active", status());
        assertEquals(0, jdbc.queryForObject("select count(*) from webhook_events where clinic_id = ?", Integer.class, clinic));
    }
    @Test void cancellationPreservesPaidPeriodAndIsIdempotent() {
        String id = create();
        snapshots.put(id, snapshot(id, "active", "starter"));
        var first = billing.cancel(clinic, id);
        assertEquals("scheduled", first.get("status"));
        assertEquals(Instant.ofEpochSecond(end).toString(), first.get("effectiveAt"));
        assertEquals("active", status());
        clearInvocations(http);
        assertEquals(first, billing.cancel(clinic, id));
        verifyNoInteractions(http);
    }
    @Test void anotherClinicCannotCancel() {
        String id = create();
        UUID other = UUID.randomUUID();
        jdbc.update("insert into clinics (id, name) values (?, 'Other')", other);
        assertEquals(404, assertThrows(ResponseStatusException.class, () -> billing.cancel(other, id)).getStatusCode().value());
    }
    @Test void failureRetainsReservationAndPreventsDuplicateCharge() throws Exception {
        // Reserve succeeds, but the create response is lost.
        when(http.send(argThat((HttpRequest r) -> r.method().equals("POST")), any(HttpResponse.BodyHandler.class)))
            .thenThrow(new java.io.IOException("timeout"));
        assertThrows(ResponseStatusException.class, this::create);
        assertEquals(409, assertThrows(ResponseStatusException.class, this::create).getStatusCode().value());
        assertEquals(1, jdbc.queryForObject("select count(*) from subscriptions where clinic_id = ? and status = 'creating'", Integer.class, clinic));
    }
    @Test void refreshRecoversActivationWithoutWebhook() {
        String id = create();
        snapshots.put(id, snapshot(id, "active", "starter"));
        assertEquals("active", billing.refresh(clinic).get("status"));
    }

    @Test void refreshReconcilesMissedCapturedChargeFromMatchingInvoice() {
        String id = create();
        snapshots.put(id, snapshot(id, "active", "starter"));
        String paymentId = "pay_" + clinic.toString().replace("-", "");
        snapshots.put(paymentId, Map.of("id", paymentId, "invoice_id", "inv_test", "status", "captured", "currency", "INR", "amount", 99900, "created_at", Instant.now().getEpochSecond()));
        invoices = List.of(Map.of("id", "inv_test", "subscription_id", id, "payment_id", paymentId, "status", "paid"));
        billing.refresh(clinic);
        billing.refresh(clinic);
        assertEquals(1, jdbc.queryForObject("select count(*) from billing_payments where clinic_id = ?", Integer.class, clinic));
    }

    @Test void adminCanRecoverLostCreateResponseOnlyForMatchingAttempt() throws Exception {
        when(http.send(argThat((HttpRequest r) -> r.method().equals("POST")), any(HttpResponse.BodyHandler.class))).thenThrow(new java.io.IOException("timeout"));
        assertThrows(ResponseStatusException.class, this::create);
        UUID attempt = jdbc.queryForObject("select id from subscriptions where clinic_id = ?", UUID.class, clinic);
        var snapshot = snapshot("sub_recovered", "created", "starter");
        snapshot.put("notes", Map.of("clinicId", clinic.toString(), "checkoutId", attempt.toString(), "plan", "starter", "billingCycle", "monthly"));
        snapshots.put("sub_recovered", snapshot);
        billing.reconcile(clinic, "sub_recovered");
        assertEquals("sub_recovered", billing.current(clinic).get("subscriptionId"));
        assertEquals("sub_recovered", create());
    }

    @Test void abandoningUnpaidCheckoutRestoresFreePlan() throws Exception {
        String id = create();
        snapshots.put(id, snapshot(id, "cancelled", "starter"));
        snapshots.get(id).put("paid_count", 0);
        snapshots.get(id).put("current_end", null);
        send("subscription.cancelled", id, UUID.randomUUID().toString(), Map.of());
        assertEquals("trial", status());
        assertEquals("trial", billing.current(clinic).get("plan"));
    }

    @Test void oldRazorpayCancellationCannotOverwriteNewManualPayment() throws Exception {
        String id = create();
        snapshots.put(id, snapshot(id, "cancelled", "starter"));
        snapshots.get(id).put("current_end", Instant.now().minusSeconds(60).getEpochSecond());
        billing.refresh(clinic);
        UUID actor = UUID.randomUUID();
        jdbc.update("insert into users (id, role, email) values (?, 'platform_admin', ?)", actor, actor + "@example.test");
        var request = new LinkedHashMap<String, Object>(Map.of("subscriptionPlan", "pro", "subscriptionStatus", "active", "billingCycle", "monthly",
            "lastPaymentAmount", 2499, "lastPaymentDate", java.time.LocalDate.now().toString(), "lastPaymentRef", "MANUAL-" + clinic));
        new org.springframework.transaction.support.TransactionTemplate(new DataSourceTransactionManager(jdbc.getDataSource())).executeWithoutResult(s -> {
            billing.recordAdminPayment(clinic, actor, request);
            jdbc.update("update clinics set subscription_plan = 'pro', subscription_status = 'active' where id = ?", clinic);
        });
        send("subscription.cancelled", id, UUID.randomUUID().toString(), Map.of());
        assertEquals("pro", billing.current(clinic).get("plan"));
        assertEquals("active", status());
        assertNull(billing.current(clinic).get("subscriptionId"));
    }
    @Test void yearlyIsRejectedBeforeProviderAccess() {
        assertThrows(ResponseStatusException.class, () -> billing.create(clinic, "starter", "yearly"));
        verifyNoInteractions(http);
    }
    @Test void manualFallbackDoesNotActivateAndMissingConfigurationFails() {
        var manual = new BillingService(jdbc, json, new DataSourceTransactionManager(jdbc.getDataSource()), "", "", "", "", "", "https://razorpay.me/test", http);
        assertEquals("manual", manual.create(clinic, "starter", "monthly").get("paymentMode"));
        assertEquals("trial", status());
        var missing = new BillingService(jdbc, json, new DataSourceTransactionManager(jdbc.getDataSource()), "", "", "", "", "", "", http);
        assertEquals(503, assertThrows(ResponseStatusException.class, () -> missing.create(clinic, "starter", "monthly")).getStatusCode().value());
    }
    @Test void credentialsRequireWebhookSecretAndPlans() {
        assertThrows(IllegalStateException.class, () -> new BillingService(jdbc, json, new DataSourceTransactionManager(jdbc.getDataSource()), "key", "secret", "", "", "", "", http));
    }

    @Test void manualPaymentRequiresReferenceAndRecordsStaffAndPeriodOnce() {
        UUID actor = UUID.randomUUID();
        jdbc.update("insert into users (id, role, email) values (?, 'platform_admin', ?)", actor, actor + "@example.test");
        var request = new LinkedHashMap<String, Object>(Map.of("subscriptionPlan", "starter", "subscriptionStatus", "active",
            "billingCycle", "monthly", "lastPaymentAmount", 999, "lastPaymentDate", java.time.LocalDate.now().toString(), "lastPaymentRef", "UPI-" + clinic));
        var transaction = new org.springframework.transaction.support.TransactionTemplate(new DataSourceTransactionManager(jdbc.getDataSource()));
        transaction.executeWithoutResult(s -> billing.recordAdminPayment(clinic, actor, request));
        transaction.executeWithoutResult(s -> billing.recordAdminPayment(clinic, actor, request));
        assertEquals(1, jdbc.queryForObject("select count(*) from billing_payments where clinic_id = ?", Integer.class, clinic));
        assertEquals(actor, jdbc.queryForObject("select recorded_by from billing_payments where clinic_id = ?", UUID.class, clinic));
        assertNotNull(request.get("subscriptionEndDate"));
        request.put("lastPaymentAmount", 1);
        assertThrows(ResponseStatusException.class, () -> transaction.executeWithoutResult(s -> billing.recordAdminPayment(clinic, actor, request)));
    }

    @Test void partialPaymentPersistsReceivedAmountAndRejectsOverpaymentAndOtherClinic() {
        UUID appointment = UUID.randomUUID();
        jdbc.update("""
            insert into appointments (id, clinic_id, booking_ref, patient_name, phone_e164, service, appointment_date, appointment_time, source)
            values (?, ?, ?, 'Patient', '+919876543210', 'Cleaning', current_date, '10:00', 'clinic_website')
            """, appointment, clinic, "B-" + UUID.randomUUID().toString().substring(0, 20));
        var service = new com.mydentalplatform.appointment.AppointmentService(jdbc, json);
        var request = new com.mydentalplatform.appointment.AppointmentController.ClinicalRequest(null, null,
            new java.math.BigDecimal("1000"), "partial", "upi", new java.math.BigDecimal("400"));
        var transaction = new org.springframework.transaction.support.TransactionTemplate(new DataSourceTransactionManager(jdbc.getDataSource()));
        transaction.executeWithoutResult(s -> service.updateClinical(clinic, appointment, request));
        var patient = new com.mydentalplatform.clinic.PatientService(jdbc).getPatients(clinic, null, 10, 0).getFirst();
        assertEquals(0, new java.math.BigDecimal("400").compareTo(patient.totalPaid()));
        assertEquals(0, new java.math.BigDecimal("600").compareTo(patient.pendingBalance()));
        var overpaid = new com.mydentalplatform.appointment.AppointmentController.ClinicalRequest(null, null,
            new java.math.BigDecimal("1000"), "partial", "upi", new java.math.BigDecimal("1200"));
        assertThrows(ResponseStatusException.class, () -> transaction.executeWithoutResult(s -> service.updateClinical(clinic, appointment, overpaid)));
        assertThrows(ResponseStatusException.class, () -> transaction.executeWithoutResult(s -> service.updateClinical(UUID.randomUUID(), appointment, request)));
    }

    @Test void oldSubscriptionEventCannotOverwriteNewSubscription() throws Exception {
        String oldId = create();
        snapshots.put(oldId, snapshot(oldId, "cancelled", "starter"));
        snapshots.get(oldId).put("current_end", Instant.now().minusSeconds(60).getEpochSecond());
        billing.refresh(clinic);
        String currentId = (String) billing.create(clinic, "pro", "monthly").get("subscriptionId");
        snapshots.put(currentId, snapshot(currentId, "active", "pro"));
        billing.refresh(clinic);
        send("subscription.cancelled", oldId, UUID.randomUUID().toString(), Map.of());
        assertEquals("pro", billing.current(clinic).get("plan"));
        assertEquals("active", status());
    }

    @Test void concurrentCheckoutRequestsShareOneProviderSubscription() throws Exception {
        try (var pool = java.util.concurrent.Executors.newFixedThreadPool(2)) {
            java.util.concurrent.Callable<String> checkout = () -> {
                try { return create(); }
                catch (ResponseStatusException e) { assertEquals(409, e.getStatusCode().value()); return "pending"; }
            };
            var first = pool.submit(checkout);
            var second = pool.submit(checkout);
            String id = first.get();
            String other = second.get();
            assertTrue(other.equals(id) || other.equals("pending") || id.equals("pending"));
            assertFalse(other.equals("pending") && id.equals("pending"));
            assertEquals(1, creates);
        }
    }
    @Test void controllerRequiresOwnerForCheckoutAndCancellation() {
        var service = mock(BillingService.class);
        var controller = new BillingController(service);
        var patient = Jwt.withTokenValue("t").header("alg", "HS256").subject(UUID.randomUUID().toString()).claim("role", "patient").claim("clinic_id", clinic.toString()).build();
        assertThrows(ResponseStatusException.class, () -> controller.create(patient, new BillingController.CheckoutRequest(clinic, "starter", "monthly")));
        assertThrows(ResponseStatusException.class, () -> controller.cancel(patient, "sub_123"));
        assertThrows(ResponseStatusException.class, () -> controller.refresh(patient));
        verifyNoInteractions(service);
    }
}
