package com.mydentalplatform.video;

import java.time.*;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class VideoConsultationService {
    private static final ZoneId INDIA = ZoneId.of("Asia/Kolkata");
    private final JdbcTemplate jdbc;
    private final DailyVideoClient daily;

    public VideoConsultationService(JdbcTemplate jdbc, DailyVideoClient daily) {
        this.jdbc = jdbc;
        this.daily = daily;
    }

    public DailyVideoClient.Session join(UUID appointmentId, UUID clinicId, String bookingRef, String phone) {
        Visit visit = requireVisit(appointmentId, clinicId, bookingRef, phone);
        Instant start = visit.date().atTime(visit.time()).atZone(INDIA).toInstant();
        String room = "mdp-" + appointmentId.toString().replace("-", "") + "-" + start.getEpochSecond();
        return daily.createSession(room, start.minusSeconds(600), start.plusSeconds(3600), clinicId != null);
    }

    public void checkAccess(UUID appointmentId, UUID clinicId, String bookingRef, String phone) {
        requireVisit(appointmentId, clinicId, bookingRef, phone);
    }

    private Visit requireVisit(UUID appointmentId, UUID clinicId, String bookingRef, String phone) {
        boolean host = clinicId != null;
        String normalized = phone == null ? "" : phone.replaceAll("[^0-9]", "");
        if (!host && (normalized.length() < 10 || bookingRef == null || bookingRef.isBlank())) throw notFound();
        String clause = host ? "a.clinic_id = ?" :
            "upper(a.booking_ref) = upper(?) and right(regexp_replace(a.phone_e164, '[^0-9]', '', 'g'), 10) = ?";
        Object[] args = host ? new Object[]{appointmentId, clinicId} :
            new Object[]{appointmentId, bookingRef.trim(), normalized.substring(normalized.length() - 10)};
        var rows = jdbc.query("""
            select a.consultation_mode, a.status::text, a.appointment_date, a.appointment_time
            from appointments a where a.id = ? and
            """ + clause, (rs, row) -> new Visit(rs.getString("consultation_mode"), rs.getString("status"),
                rs.getObject("appointment_date", LocalDate.class), rs.getObject("appointment_time", LocalTime.class)), args);
        if (rows.isEmpty()) throw notFound();
        Visit visit = rows.getFirst();
        validateAccess(visit, Instant.now());
        return visit;
    }

    static void validateAccess(Visit visit, Instant now) {
        if (!"video".equals(visit.mode()) || !java.util.List.of("confirmed", "checked_in").contains(visit.status())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A confirmed video appointment is required to join.");
        }
        Instant start = visit.date().atTime(visit.time()).atZone(INDIA).toInstant();
        if (now.isBefore(start.minusSeconds(600))) throw new ResponseStatusException(HttpStatus.CONFLICT,
            "Your video room opens 10 minutes before the appointment. Please come back then.");
        if (!now.isBefore(start.plusSeconds(3600))) throw new ResponseStatusException(HttpStatus.GONE,
            "This video appointment has ended. Please contact the clinic to arrange another time.");
    }

    public Map<String, Object> settings(UUID clinicId) {
        var rows = jdbc.queryForList("""
            select coalesce(public_config->'marketplaceProfile'->>'videoConsultationEnabled', 'false') as enabled,
                   public_config->'marketplaceProfile'->>'videoConsultationFee' as fee
            from clinics where id = ?
            """, clinicId);
        if (rows.isEmpty()) throw notFound();
        var row = rows.getFirst();
        var result = new java.util.LinkedHashMap<String, Object>();
        result.put("providerReady", daily.configured());
        result.put("enabled", "true".equals(row.get("enabled")));
        result.put("fee", row.get("fee"));
        return result;
    }

    public void saveSettings(UUID clinicId, boolean enabled, Integer fee) {
        if (enabled && !daily.configured()) throw new ResponseStatusException(HttpStatus.CONFLICT,
            "Video calling needs to be configured by the platform administrator first.");
        int updated = jdbc.update("""
            update clinics set public_config = jsonb_set(public_config, '{marketplaceProfile}',
                coalesce(nullif(public_config->'marketplaceProfile', 'null'::jsonb), '{}'::jsonb) ||
                jsonb_build_object('videoConsultationEnabled', ?::boolean, 'videoConsultationFee', ?::integer)),
                updated_at = now() where id = ?
            """, enabled, fee, clinicId);
        if (updated != 1) throw notFound();
    }

    private ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Appointment or clinic not found.");
    }

    record Visit(String mode, String status, LocalDate date, LocalTime time) {}
}
