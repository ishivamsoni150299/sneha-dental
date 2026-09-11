package com.mydentalplatform.notification;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;

@Service
public class NotificationService {
    private static final Logger LOG = LoggerFactory.getLogger(NotificationService.class);
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();
    private final String resendApiKey;
    private final String emailFrom;
    private final String publicBaseUrl;

    public NotificationService(
        JdbcTemplate jdbcTemplate,
        ObjectMapper objectMapper,
        @Value("${platform.email.resend-api-key:}") String resendApiKey,
        @Value("${platform.email.from:onboarding@resend.dev}") String emailFrom,
        @Value("${platform.public-base-url:https://mydentalplatform.com}") String publicBaseUrl
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
        this.resendApiKey = resendApiKey;
        this.emailFrom = emailFrom;
        this.publicBaseUrl = publicBaseUrl;
        this.httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();
    }

    public void notifyClinicNewAppointment(
        UUID clinicId,
        String bookingRef,
        String patientName,
        String phone,
        String service,
        LocalDate date,
        LocalTime time,
        String source
    ) {
        executor.submit(() -> {
            try {
                String clinicEmail = getClinicNotificationEmail(clinicId);
                if (clinicEmail == null || clinicEmail.isBlank()) return;

                String idempotencyKey = "apt_new_" + bookingRef;
                String clinicName = getClinicName(clinicId);
                String subject = "New Appointment Request: " + bookingRef + " (" + patientName + ")";
                String html = """
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b;">
                      <h2 style="color: #1e56dc; margin-bottom: 8px;">New Appointment Request</h2>
                      <p style="font-size: 15px; margin-bottom: 20px;">A new appointment has been requested for <strong>%s</strong>.</p>
                      
                      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                        <p style="margin: 0 0 10px;"><strong>Reference:</strong> %s</p>
                        <p style="margin: 0 0 10px;"><strong>Patient:</strong> %s</p>
                        <p style="margin: 0 0 10px;"><strong>Phone:</strong> <a href="tel:%s">%s</a> (<a href="https://wa.me/%s">WhatsApp</a>)</p>
                        <p style="margin: 0 0 10px;"><strong>Treatment:</strong> %s</p>
                        <p style="margin: 0 0 10px;"><strong>Date:</strong> %s at %s</p>
                        <p style="margin: 0;"><strong>Source:</strong> %s</p>
                      </div>
                      
                      <a href="%s/business/login" style="display: inline-block; background-color: #1e56dc; color: #ffffff; text-decoration: none; font-weight: bold; padding: 12px 24px; border-radius: 8px;">
                        Open Clinic Dashboard
                      </a>
                    </div>
                    """.formatted(
                        escape(clinicName),
                        escape(bookingRef),
                        escape(patientName),
                        escape(phone), escape(phone), escape(phone.replaceAll("[^0-9]", "")),
                        escape(service),
                        date.toString(), time.toString(),
                        escape(source),
                        publicBaseUrl
                    );

                dispatchEmail(clinicId, null, "appointment_requested", clinicEmail, subject, html, idempotencyKey);
            } catch (Exception error) {
                LOG.error("Failed to process clinic new appointment notification for {}", bookingRef, error);
            }
        });
    }

    public void notifyPatientStatusUpdate(
        UUID clinicId,
        UUID appointmentId,
        String bookingRef,
        String patientName,
        String patientEmail,
        String status,
        LocalDate date,
        LocalTime time,
        String reason
    ) {
        if (patientEmail == null || patientEmail.isBlank()) return;

        executor.submit(() -> {
            try {
                String idempotencyKey = "apt_status_" + appointmentId + "_" + status;
                String clinicName = getClinicName(clinicId);
                String statusTitle = "confirmed".equalsIgnoreCase(status) ? "Confirmed" :
                    "cancelled".equalsIgnoreCase(status) ? "Cancelled" :
                    "declined".equalsIgnoreCase(status) ? "Declined" : status;

                String mode = jdbcTemplate.queryForObject("select consultation_mode from appointments where id = ?", String.class, appointmentId);
                boolean video = "video".equals(mode);
                String subject = (video ? "Video appointment " : "Appointment ") + statusTitle + ": " + clinicName + " (Ref: " + bookingRef + ")";
                String messageBody = "confirmed".equalsIgnoreCase(status)
                    ? (video ? "Your video consultation is confirmed. Open My appointments on mydentalplatform.com with your booking reference and phone number. Your private video room opens 10 minutes before your appointment; allow camera and microphone access when prompted."
                        : "Your appointment has been confirmed. We look forward to seeing you!")
                    : "cancelled".equalsIgnoreCase(status)
                    ? "Your appointment has been cancelled." + (reason != null && !reason.isBlank() ? " Reason: " + escape(reason) : "")
                    : "The clinic was unable to accept this appointment time." + (reason != null && !reason.isBlank() ? " Reason: " + escape(reason) : "");

                String html = """
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b;">
                      <h2 style="color: #1e56dc; margin-bottom: 8px;">Appointment %s</h2>
                      <p style="font-size: 15px;">Dear %s,</p>
                      <p style="font-size: 15px; margin-bottom: 20px;">%s</p>
                      
                      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                        <p style="margin: 0 0 10px;"><strong>Clinic:</strong> %s</p>
                        <p style="margin: 0 0 10px;"><strong>Booking Reference:</strong> %s</p>
                        <p style="margin: 0 0 10px;"><strong>Date & Time:</strong> %s at %s</p>
                        <p style="margin: 0;"><strong>Status:</strong> %s</p>
                      </div>
                      
                      <p style="font-size: 13px; color: #64748b;">
                        Need to change your appointment? Visit your booking details online anytime using reference <strong>%s</strong>.
                      </p>
                    </div>
                    """.formatted(
                        statusTitle,
                        escape(patientName),
                        messageBody,
                        escape(clinicName),
                        escape(bookingRef),
                        date.toString(), time.toString(),
                        statusTitle,
                        escape(bookingRef)
                    );

                dispatchEmail(clinicId, appointmentId, "patient_status_" + status, patientEmail, subject, html, idempotencyKey);
            } catch (Exception error) {
                LOG.error("Failed to process patient status notification for {}", bookingRef, error);
            }
        });
    }

    public void notifyClinicNewContact(
        UUID clinicId,
        String senderName,
        String phone,
        String email,
        String message
    ) {
        executor.submit(() -> {
            try {
                String clinicEmail = getClinicNotificationEmail(clinicId);
                if (clinicEmail == null || clinicEmail.isBlank()) return;

                String idempotencyKey = "contact_" + UUID.randomUUID();
                String clinicName = getClinicName(clinicId);
                String subject = "New Website Enquiry from " + senderName;
                String html = """
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b;">
                      <h2 style="color: #1e56dc; margin-bottom: 8px;">New Patient Enquiry</h2>
                      <p style="font-size: 15px; margin-bottom: 20px;">A new enquiry was submitted on your clinic website for <strong>%s</strong>.</p>
                      
                      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                        <p style="margin: 0 0 10px;"><strong>Name:</strong> %s</p>
                        <p style="margin: 0 0 10px;"><strong>Phone:</strong> <a href="tel:%s">%s</a> (<a href="https://wa.me/%s">WhatsApp</a>)</p>
                        <p style="margin: 0 0 10px;"><strong>Email:</strong> %s</p>
                        <p style="margin: 0;"><strong>Message:</strong><br><span style="white-space: pre-wrap;">%s</span></p>
                      </div>
                      
                      <a href="%s/business/login" style="display: inline-block; background-color: #1e56dc; color: #ffffff; text-decoration: none; font-weight: bold; padding: 12px 24px; border-radius: 8px;">
                        View in Clinic Dashboard
                      </a>
                    </div>
                    """.formatted(
                        escape(clinicName),
                        escape(senderName),
                        escape(phone), escape(phone), escape(phone.replaceAll("[^0-9]", "")),
                        escape(email != null ? email : "Not provided"),
                        escape(message),
                        publicBaseUrl
                    );

                dispatchEmail(clinicId, null, "contact_enquiry", clinicEmail, subject, html, idempotencyKey);
            } catch (Exception error) {
                LOG.error("Failed to process clinic contact enquiry notification", error);
            }
        });
    }

    public void sendReviewInvitation(UUID clinicId, UUID appointmentId, String bookingRef,
                                      String patientName, String patientEmail,
                                      String clinicName, LocalDate appointmentDate) {
        if (patientEmail == null || patientEmail.isBlank()) return;
        executor.submit(() -> {
            try {
                String firstName = patientName.split("\\s+")[0];
                String dateFormatted = appointmentDate.format(java.time.format.DateTimeFormatter.ofPattern("d MMMM yyyy"));
                String reviewLink = "https://mydentalplatform.com/appointments?claim=" + bookingRef + "&review=true";
                String subject = "How was your visit to " + clinicName + "?";
                String html = """
                    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
                      <h2 style="color:#1e3a5f;margin:0 0 16px">Hi %s,</h2>
                      <p style="color:#374151;line-height:1.6;margin:0 0 12px">
                        Thank you for visiting <strong>%s</strong> on %s.
                      </p>
                      <p style="color:#374151;line-height:1.6;margin:0 0 24px">
                        Your feedback helps other patients find the right dentist. It only takes 30 seconds.
                      </p>
                      <a href="%s" style="display:inline-block;background:#2563eb;color:#fff;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none">
                        Rate your visit
                      </a>
                      <p style="color:#6b7280;font-size:13px;margin:24px 0 0;line-height:1.5">
                        Booking ref: %s<br>
                        This email was sent by mydentalplatform.com
                      </p>
                    </div>
                    """.formatted(firstName, clinicName, dateFormatted, reviewLink, bookingRef);
                String idempotencyKey = "review_invite_" + appointmentId;
                dispatchEmail(clinicId, appointmentId, "review_invitation", patientEmail, subject, html, idempotencyKey);
            } catch (Exception error) {
                LOG.warn("Review invitation failed for appointment {}", appointmentId, error);
            }
        });
    }

    private void dispatchEmail(
        UUID clinicId,
        UUID appointmentId,
        String notificationType,
        String destination,
        String subject,
        String html,
        String idempotencyKey
    ) {
        String payloadJson = "{}";
        try {
            payloadJson = objectMapper.writeValueAsString(Map.of("subject", subject, "html", html));
        } catch (Exception ignored) {}

        int inserted = jdbcTemplate.update("""
            insert into notifications (idempotency_key, clinic_id, appointment_id, notification_type, destination, status, data, attempts)
            values (?, ?, ?, ?, ?, 'pending', cast(? as jsonb), 1)
            on conflict (idempotency_key) do nothing
            """, idempotencyKey, clinicId, appointmentId, notificationType, destination, payloadJson);

        try {
            jdbcTemplate.update("""
                insert into notification_outbox (idempotency_key, clinic_id, appointment_id, notification_type, channel, destination, subject, payload, status, attempts)
                values (?, ?, ?, ?, 'email', ?, ?, cast(? as jsonb), 'pending', 1)
                on conflict (idempotency_key) do nothing
                """, idempotencyKey, clinicId, appointmentId, notificationType, destination, subject, payloadJson);
        } catch (Exception ignored) {}

        if (inserted == 0) {
            LOG.info("Notification with idempotency key {} already processed or queued. Skipping duplicate.", idempotencyKey);
            return;
        }

        if (resendApiKey == null || resendApiKey.isBlank()) {
            LOG.info("Resend API key not configured. Logged notification {} to database without sending.", idempotencyKey);
            return;
        }

        boolean success = sendResendEmail(destination, subject, html);
        if (success) {
            jdbcTemplate.update("update notifications set status = 'sent', updated_at = now() where idempotency_key = ?", idempotencyKey);
            try {
                jdbcTemplate.update("update notification_outbox set status = 'sent', processed_at = now(), updated_at = now() where idempotency_key = ?", idempotencyKey);
            } catch (Exception ignored) {}
            LOG.info("Successfully sent notification {} to {}", notificationType, destination);
        } else {
            jdbcTemplate.update("update notifications set status = 'failed', updated_at = now() where idempotency_key = ?", idempotencyKey);
            try {
                jdbcTemplate.update("update notification_outbox set status = 'failed', next_retry_at = now() + interval '5 minutes', updated_at = now() where idempotency_key = ?", idempotencyKey);
            } catch (Exception ignored) {}
            LOG.warn("Delivery failed for notification {}", idempotencyKey);
        }
    }

    private boolean sendResendEmail(String destination, String subject, String html) {
        try {
            String body = objectMapper.writeValueAsString(Map.of(
                "from", emailFrom,
                "to", List.of(destination),
                "subject", subject,
                "html", html
            ));

            HttpRequest request = HttpRequest.newBuilder(URI.create("https://api.resend.com/emails"))
                .timeout(Duration.ofSeconds(15))
                .header("Authorization", "Bearer " + resendApiKey)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            return response.statusCode() >= 200 && response.statusCode() < 300;
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            LOG.error("Resend email delivery interrupted for destination {}", destination, error);
            return false;
        } catch (Exception error) {
            LOG.error("Resend email delivery error for destination {}", destination, error);
            return false;
        }
    }

    @Scheduled(fixedDelay = 900000, initialDelay = 60000)
    public void retryFailedNotifications() {
        if (resendApiKey == null || resendApiKey.isBlank()) return;

        List<Map<String, Object>> failed = jdbcTemplate.queryForList("""
            select id, idempotency_key, notification_type, destination, attempts, data::text as data_json
            from notifications
            where status = 'failed' and attempts < 3
            order by created_at asc
            limit 20
            """);

        if (failed.isEmpty()) return;
        LOG.info("Found {} failed notifications to retry.", failed.size());

        for (Map<String, Object> row : failed) {
            String destination = (String) row.get("destination");
            String key = (String) row.get("idempotency_key");
            String dataJson = (String) row.get("data_json");
            int attempts = ((Number) row.get("attempts")).intValue();

            try {
                Map<String, Object> payload = objectMapper.readValue(dataJson, new tools.jackson.core.type.TypeReference<>() {});
                String subject = (String) payload.get("subject");
                String html = (String) payload.get("html");

                boolean success = sendResendEmail(destination, subject, html);
                if (success) {
                    jdbcTemplate.update("update notifications set status = 'sent', attempts = attempts + 1, updated_at = now() where idempotency_key = ?", key);
                    try {
                        jdbcTemplate.update("update notification_outbox set status = 'sent', attempts = attempts + 1, processed_at = now(), updated_at = now() where idempotency_key = ?", key);
                    } catch (Exception ignored) {}
                    LOG.info("Retry succeeded for notification {}", key);
                } else {
                    jdbcTemplate.update("update notifications set attempts = attempts + 1, updated_at = now() where idempotency_key = ?", key);
                    try {
                        jdbcTemplate.update("update notification_outbox set status = 'failed', attempts = attempts + 1, next_retry_at = now() + interval '15 minutes', updated_at = now() where idempotency_key = ?", key);
                    } catch (Exception ignored) {}
                    LOG.warn("Retry failed for notification {} (attempt {})", key, attempts + 1);
                }
            } catch (Exception error) {
                jdbcTemplate.update("update notifications set attempts = attempts + 1, updated_at = now() where idempotency_key = ?", key);
                try {
                    jdbcTemplate.update("update notification_outbox set status = 'failed', attempts = attempts + 1, next_retry_at = now() + interval '15 minutes', updated_at = now() where idempotency_key = ?", key);
                } catch (Exception ignored) {}
                LOG.error("Failed executing retry for notification {}", key, error);
            }
        }
    }

    private String getClinicNotificationEmail(UUID clinicId) {
        return jdbcTemplate.query("""
            select coalesce(nullif(p.billing_email, ''), nullif(c.public_config ->> 'email', '')) as email
            from clinics c
            left join clinic_private_accounts p on p.clinic_id = c.id
            where c.id = ?
            """, resultSet -> resultSet.next() ? resultSet.getString("email") : null, clinicId);
    }

    private String getClinicName(UUID clinicId) {
        return jdbcTemplate.query("""
            select name from clinics where id = ?
            """, resultSet -> resultSet.next() ? resultSet.getString("name") : "Dental Clinic", clinicId);
    }

    private String escape(String text) {
        if (text == null) return "";
        return text.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\"", "&quot;")
            .replace("'", "&#39;");
    }
}
