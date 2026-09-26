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

    private final String resendApiKey;
    private final String emailFrom;
    private final String publicBaseUrl;

    public boolean canSendEmail() { return resendApiKey != null && !resendApiKey.isBlank(); }

    @org.springframework.transaction.annotation.Transactional
    public void notifyAppointmentClaim(UUID clinicId, UUID appointmentId, String destination, String code, UUID challengeId) {
        if (!canSendEmail()) throw new IllegalStateException("Email delivery is not configured.");
        String html = "<p>Use this code to link your appointment to your patient account: <strong>" + code
            + "</strong></p><p>The code expires in 10 minutes. If you did not request this, ignore this email.</p>";
        dispatchEmail(clinicId, appointmentId, "appointment_claim", destination,
            "Your appointment linking code", html, "appointment_claim_" + challengeId);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public NotificationService(
        JdbcTemplate jdbcTemplate,
        ObjectMapper objectMapper,
        @Value("${platform.email.resend-api-key:}") String resendApiKey,
        @Value("${platform.email.from:onboarding@resend.dev}") String emailFrom,
        @Value("${platform.public-base-url:https://mydentalplatform.com}") String publicBaseUrl
    ) {
        this(jdbcTemplate, objectMapper, resendApiKey, emailFrom, publicBaseUrl,
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build());
    }

    public NotificationService(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper, String resendApiKey,
        String emailFrom, String publicBaseUrl, HttpClient httpClient) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
        this.resendApiKey = resendApiKey;
        this.emailFrom = emailFrom;
        this.publicBaseUrl = publicBaseUrl;
        this.httpClient = httpClient;
    }

    @org.springframework.transaction.annotation.Transactional
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

    }

    @org.springframework.transaction.annotation.Transactional
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


                boolean reminder = "reminder".equals(status);
                String idempotencyKey = "apt_status_" + appointmentId + "_" + status + (reminder ? "_" + date : "");
                String clinicName = getClinicName(clinicId);
                String statusTitle = reminder ? "Reminder" : "confirmed".equalsIgnoreCase(status) ? "Confirmed" :
                    "cancelled".equalsIgnoreCase(status) ? "Cancelled" :
                    "declined".equalsIgnoreCase(status) ? "Declined" : status;

                String mode = jdbcTemplate.queryForObject("select consultation_mode from appointments where id = ?", String.class, appointmentId);
                boolean video = "video".equals(mode);
                String subject = (video ? "Video appointment " : "Appointment ") + statusTitle + ": " + clinicName + " (Ref: " + bookingRef + ")";
                String messageBody = reminder ? "Your appointment is tomorrow. Sign in to My appointments to view the details."
                    : "confirmed".equalsIgnoreCase(status)
                    ? (video ? "Your video consultation is confirmed. Sign in to My appointments to join. Your private video room opens 10 minutes before your appointment; allow camera and microphone access when prompted."
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

                dispatchEmail(clinicId, appointmentId, reminder ? "appointment_reminder" : "patient_status_" + status, patientEmail, subject, html, idempotencyKey);

    }

    @org.springframework.transaction.annotation.Transactional
    public void notifyClinicNewContact(
        UUID clinicId,
        String senderName,
        String phone,
        String email,
        String message
    ) {

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

    }

    @org.springframework.transaction.annotation.Transactional
    public void sendReviewInvitation(UUID clinicId, UUID appointmentId, String bookingRef,
                                      String patientName, String patientEmail,
                                      String clinicName, LocalDate appointmentDate) {
        if (patientEmail == null || patientEmail.isBlank()) return;

                String firstName = patientName.split("\\s+")[0];
                String dateFormatted = appointmentDate.format(java.time.format.DateTimeFormatter.ofPattern("d MMMM yyyy"));
                String reviewLink = publicBaseUrl + "/appointments";
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
                    """.formatted(escape(firstName), escape(clinicName), dateFormatted, escape(reviewLink), escape(bookingRef));
                String idempotencyKey = "review_invite_" + appointmentId;
                dispatchEmail(clinicId, appointmentId, "review_invitation", patientEmail, subject, html, idempotencyKey);

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
        String payloadJson = objectMapper.writeValueAsString(Map.of("subject", subject, "html", html));
        jdbcTemplate.update("""
            insert into notification_outbox (idempotency_key, clinic_id, appointment_id, notification_type, channel, destination, subject, payload)
            values (?, ?, ?, ?, 'email', ?, ?, cast(? as jsonb))
            on conflict (idempotency_key) do nothing
            """, idempotencyKey, clinicId, appointmentId, notificationType, destination, subject.substring(0, Math.min(subject.length(), 255)), payloadJson);
    }

    private boolean sendResendEmail(String destination, String subject, String html, String key) {
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
                .header("Idempotency-Key", key)
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            return response.statusCode() >= 200 && response.statusCode() < 300;
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            LOG.warn("Resend delivery interrupted");
            return false;
        } catch (Exception error) {
            LOG.warn("Resend delivery failed: {}", error.getClass().getSimpleName());
            return false;
        }
    }

    @Scheduled(fixedDelay = 30000, initialDelay = 30000)
    public void retryFailedNotifications() {
        if (resendApiKey == null || resendApiKey.isBlank()) return;
        jdbcTemplate.update("update notification_outbox set status = 'failed', updated_at = now() where status = 'processing' and attempts >= 3 and next_retry_at <= now()");
        // Claim one at a time: another instance cannot send the same row during this lease.
        for (int count = 0; count < 20; count++) {
            var rows = jdbcTemplate.queryForList("""
                update notification_outbox set status = 'processing', attempts = attempts + 1,
                    next_retry_at = now() + interval '2 minutes', updated_at = now()
                where id = (
                    select id from notification_outbox
                    where status in ('pending', 'failed', 'processing') and attempts < 3
                      and next_retry_at <= now()
                    order by created_at for update skip locked limit 1
                )
                returning id, idempotency_key, destination, subject, payload::text as payload_json
                """);
            if (rows.isEmpty()) return;
            var row = rows.getFirst();
            boolean success = false;
            try {
                var payload = objectMapper.readTree((String) row.get("payload_json"));
                success = sendResendEmail((String) row.get("destination"), (String) row.get("subject"),
                    payload.path("html").asText(), (String) row.get("idempotency_key"));
            } catch (Exception error) {
                LOG.warn("Notification payload could not be delivered: {}", error.getClass().getSimpleName());
            }
            jdbcTemplate.update("""
                update notification_outbox set status = ?, processed_at = case when ? then now() else null end,
                    next_retry_at = now() + interval '5 minutes', updated_at = now()
                where id = ?
                """, success ? "sent" : "failed", success, row.get("id"));
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
