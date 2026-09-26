package com.mydentalplatform.appointment;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.mydentalplatform.notification.NotificationService;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AppointmentClaimServiceTest {
    @Test void unknownReferenceDoesNotRevealBookingOrSendCode() {
        var jdbc = mock(JdbcTemplate.class);
        var encoder = mock(PasswordEncoder.class);
        var mail = mock(NotificationService.class);
        when(mail.canSendEmail()).thenReturn(true);
        when(jdbc.queryForObject(contains("count(*)"), eq(Integer.class), any())).thenReturn(0);
        var claims = new AppointmentClaimService(jdbc, encoder, mail);

        assertNotNull(claims.request(UUID.randomUUID(), "SC-ABCDEFGH"));
        verify(mail, never()).notifyAppointmentClaim(any(), any(), any(), any(), any());
    }

    @Test void correctEmailCodeClaimsOnlyAnUnlinkedAppointment() {
        var jdbc = mock(JdbcTemplate.class);
        var encoder = mock(PasswordEncoder.class);
        var mail = mock(NotificationService.class);
        UUID user = UUID.randomUUID(), challenge = UUID.randomUUID(), appointment = UUID.randomUUID();
        when(jdbc.queryForList(contains("for update"), eq(challenge), eq(user))).thenReturn(List.of(Map.of(
            "appointment_id", appointment, "secret_hash", "hashed", "attempts", 0,
            "expires_at", OffsetDateTime.now().plusMinutes(5))));
        when(encoder.matches("12345678", "hashed")).thenReturn(true);
        when(jdbc.update(contains("where id = ? and patient_id is null"), eq(user), eq(appointment))).thenReturn(1);

        assertEquals(appointment, new AppointmentClaimService(jdbc, encoder, mail).complete(user, challenge, "12345678"));
        verify(jdbc).update(contains("where id = ? and patient_id is null"), eq(user), eq(appointment));
        verify(jdbc).update(contains("set consumed_at = now()"), eq(challenge));
    }

    @Test void wrongCodeRecordsFailedAttemptAndCannotClaim() {
        var jdbc = mock(JdbcTemplate.class);
        var encoder = mock(PasswordEncoder.class);
        var mail = mock(NotificationService.class);
        UUID user = UUID.randomUUID(), challenge = UUID.randomUUID(), appointment = UUID.randomUUID();
        when(jdbc.queryForList(contains("for update"), eq(challenge), eq(user))).thenReturn(List.of(Map.of(
            "appointment_id", appointment, "secret_hash", "hashed", "attempts", 0,
            "expires_at", OffsetDateTime.now().plusMinutes(5))));

        assertNull(new AppointmentClaimService(jdbc, encoder, mail).complete(user, challenge, "00000000"));
        verify(jdbc).update(contains("set attempts = attempts + 1"), eq(challenge));
        verify(jdbc, never()).update(contains("update appointments set patient_id"), any(), any());
    }
}
