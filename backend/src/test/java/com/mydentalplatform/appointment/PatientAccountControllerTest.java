package com.mydentalplatform.appointment;

import java.util.*;
import com.mydentalplatform.video.VideoConsultationService;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class PatientAccountControllerTest {
    private Jwt jwt(UUID id, String role) { return Jwt.withTokenValue("test").header("alg", "HS256").subject(id.toString()).claim("role", role).build(); }
    @Test void anotherPatientsAppointmentCannotBeCancelledOrJoined() {
        var jdbc = mock(JdbcTemplate.class); var appointments = mock(AppointmentService.class); var video = mock(VideoConsultationService.class);
        var controller = new PatientAccountController(jdbc, appointments, video, mock(AppointmentClaimService.class));
        var token = jwt(UUID.randomUUID(), "patient"); var appointment = UUID.randomUUID();
        assertThrows(ResponseStatusException.class, () -> controller.cancel(token, appointment));
        assertThrows(ResponseStatusException.class, () -> controller.join(token, appointment));
        verifyNoInteractions(appointments, video);
    }
    @Test void ownAppointmentUsesServerBookingDetailsWithoutPhoneVerification() {
        var jdbc = mock(JdbcTemplate.class); var appointments = mock(AppointmentService.class); var video = mock(VideoConsultationService.class);
        var user = UUID.randomUUID(); var appointment = UUID.randomUUID();
        when(jdbc.queryForList(contains("id = ? and patient_id = ?"), eq(appointment), eq(user)))
            .thenReturn(List.of(Map.of("booking_ref", "BK-PRIVATE", "phone_e164", "+919999999999")));
        var controller = new PatientAccountController(jdbc, appointments, video, mock(AppointmentClaimService.class));
        controller.cancel(jwt(user, "patient"), appointment);
        controller.join(jwt(user, "patient"), appointment);
        verify(appointments).patientCancel(appointment, "+919999999999");
        verify(video).join(appointment, null, "BK-PRIVATE", "+919999999999");
    }
    @Test void staffCannotEnterPatientAccountApi() {
        var jdbc = mock(JdbcTemplate.class);
        var controller = new PatientAccountController(jdbc, mock(AppointmentService.class), mock(VideoConsultationService.class), mock(AppointmentClaimService.class));
        assertThrows(ResponseStatusException.class, () -> controller.session(jwt(UUID.randomUUID(), "dentist")));
        verifyNoInteractions(jdbc);
    }
}
