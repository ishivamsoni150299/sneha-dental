package com.mydentalplatform.appointment;

import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.mydentalplatform.notification.NotificationService;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AppointmentClaimService {
    private final JdbcTemplate jdbc;
    private final PasswordEncoder encoder;
    private final NotificationService notifications;
    private final SecureRandom random = new SecureRandom();

    public AppointmentClaimService(JdbcTemplate jdbc, PasswordEncoder encoder, NotificationService notifications) {
        this.jdbc = jdbc;
        this.encoder = encoder;
        this.notifications = notifications;
    }

    /** A random response id avoids revealing whether the reference has a claimable email. */
    @Transactional
    public UUID request(UUID userId, String bookingRef) {
        if (!notifications.canSendEmail()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
            "Appointment linking is temporarily unavailable. Contact the clinic to verify your booking.");
        Integer recent = jdbc.queryForObject("""
            select count(*) from appointment_claim_challenges
            where user_id = ? and created_at > now() - interval '1 hour'
            """, Integer.class, userId);
        if (recent != null && recent >= 5) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
            "Please wait before requesting another linking code.");
        UUID responseId = UUID.randomUUID();
        List<Map<String, Object>> rows = jdbc.queryForList("""
            select id, clinic_id, email from appointments
            where upper(booking_ref) = upper(?) and patient_id is null
              and email is not null and email <> ''
            """, bookingRef);
        if (rows.size() != 1) return responseId;
        Map<String, Object> row = rows.getFirst();
        UUID appointmentId = (UUID) row.get("id");
        String code = "%08d".formatted(random.nextInt(100_000_000));
        jdbc.update("""
            insert into appointment_claim_challenges (id, appointment_id, user_id, secret_hash, expires_at)
            values (?, ?, ?, ?, now() + interval '10 minutes')
            """, responseId, appointmentId, userId, encoder.encode(code));
        jdbc.update("insert into appointment_claim_events (appointment_id, user_id, event_type) values (?, ?, 'requested')",
            appointmentId, userId);
        notifications.notifyAppointmentClaim((UUID) row.get("clinic_id"), appointmentId,
            (String) row.get("email"), code, responseId);
        return responseId;
    }

    /** Returns the appointment id only after the email challenge succeeds. Failure changes are committed for rate limiting. */
    @Transactional
    public UUID complete(UUID userId, UUID challengeId, String code) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
            select appointment_id, secret_hash, attempts, expires_at, consumed_at
            from appointment_claim_challenges where id = ? and user_id = ? for update
            """, challengeId, userId);
        if (rows.isEmpty()) return null;
        Map<String, Object> row = rows.getFirst();
        UUID appointmentId = (UUID) row.get("appointment_id");
        int attempts = ((Number) row.get("attempts")).intValue();
        Object expiry = row.get("expires_at");
        Instant expiresAt = expiry instanceof Timestamp timestamp ? timestamp.toInstant()
            : ((OffsetDateTime) expiry).toInstant();
        if (row.get("consumed_at") != null || attempts >= 5 || !expiresAt.isAfter(Instant.now())) return null;
        jdbc.update("update appointment_claim_challenges set attempts = attempts + 1 where id = ?", challengeId);
        if (!encoder.matches(code, (String) row.get("secret_hash"))) {
            jdbc.update("insert into appointment_claim_events (appointment_id, user_id, event_type) values (?, ?, 'rejected')",
                appointmentId, userId);
            return null;
        }
        int linked = jdbc.update("update appointments set patient_id = ?, updated_at = now() where id = ? and patient_id is null",
            userId, appointmentId);
        if (linked != 1) return null;
        jdbc.update("update appointment_claim_challenges set consumed_at = now() where id = ?", challengeId);
        jdbc.update("insert into appointment_claim_events (appointment_id, user_id, event_type) values (?, ?, 'claimed')",
            appointmentId, userId);
        return appointmentId;
    }
}
