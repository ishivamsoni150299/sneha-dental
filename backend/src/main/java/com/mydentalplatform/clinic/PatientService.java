package com.mydentalplatform.clinic;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class PatientService {
    private final JdbcTemplate jdbcTemplate;

    public PatientService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public record PatientSummary(
        String phone,
        String name,
        String email,
        long totalVisits,
        long totalAppointments,
        String lastVisitDate,
        String nextAppointmentDate,
        String firstSeen,
        BigDecimal totalCharged,
        BigDecimal totalPaid,
        BigDecimal pendingBalance
    ) {}

    public List<PatientSummary> getPatients(UUID clinicId, String search, int limit, int offset) {
        int maxLimit = Math.max(1, Math.min(limit, 200));
        int safeOffset = Math.max(0, offset);

        String searchPattern = (search != null && !search.isBlank())
            ? "%" + search.trim().toLowerCase() + "%"
            : null;

        return jdbcTemplate.query("""
            select
                phone_e164 as phone,
                coalesce(max(patient_name), 'Unknown') as name,
                max(email) as email,
                count(*) filter (where status in ('completed', 'checked_in')) as total_visits,
                count(*) as total_appointments,
                to_char(max(appointment_date) filter (where status in ('completed', 'checked_in')), 'YYYY-MM-DD') as last_visit_date,
                to_char(min(appointment_date) filter (where status in ('pending', 'confirmed') and appointment_date >= current_date), 'YYYY-MM-DD') as next_appointment_date,
                to_char(min(appointment_date), 'YYYY-MM-DD') as first_seen,
                coalesce(sum(amount_charged), 0) as total_charged,
                coalesce(sum(case when payment_status = 'paid' then amount_charged else 0 end), 0) as total_paid,
                coalesce(sum(case when payment_status != 'paid' or payment_status is null then amount_charged else 0 end), 0) as pending_balance
            from appointments
            where clinic_id = ?
              and (? is null or lower(patient_name) like ? or phone_e164 like ?)
            group by phone_e164
            order by max(created_at) desc
            limit ? offset ?
            """, (rs, rowNum) -> mapPatient(rs),
            clinicId, searchPattern, searchPattern, searchPattern, maxLimit, safeOffset);
    }

    public List<Map<String, Object>> getPatientAppointments(UUID clinicId, String phone) {
        String normalized = phone.replaceAll("[^0-9]", "");
        String last10 = normalized.length() >= 10 ? normalized.substring(normalized.length() - 10) : normalized;

        return jdbcTemplate.query("""
            select a.*, d.name as doctor_name from appointments a
            left join doctors d on d.id = a.doctor_id
            where a.clinic_id = ?
              and right(regexp_replace(a.phone_e164, '[^0-9]', '', 'g'), 10) = ?
            order by a.appointment_date desc, a.appointment_time desc
            """, (rs, rowNum) -> {
                Map<String, Object> map = new LinkedHashMap<>();
                map.put("id", rs.getObject("id", UUID.class).toString());
                map.put("bookingRef", rs.getString("booking_ref"));
                map.put("patientName", rs.getString("patient_name"));
                map.put("phone", rs.getString("phone_e164"));
                map.put("email", rs.getString("email"));
                map.put("service", rs.getString("service"));
                map.put("date", rs.getDate("appointment_date").toLocalDate().toString());
                map.put("time", rs.getTime("appointment_time").toLocalTime().toString());
                map.put("status", rs.getString("status"));
                map.put("doctorName", rs.getString("doctor_name"));
                map.put("message", rs.getString("message"));
                map.put("clinicNotes", rs.getString("clinic_notes"));
                map.put("treatmentDone", rs.getString("treatment_done"));
                map.put("amountCharged", rs.getBigDecimal("amount_charged"));
                map.put("paymentStatus", rs.getString("payment_status"));
                map.put("paymentMethod", rs.getString("payment_method"));
                return map;
            }, clinicId, last10);
    }

    private PatientSummary mapPatient(ResultSet rs) throws SQLException {
        return new PatientSummary(
            rs.getString("phone"),
            rs.getString("name"),
            rs.getString("email"),
            rs.getLong("total_visits"),
            rs.getLong("total_appointments"),
            rs.getString("last_visit_date"),
            rs.getString("next_appointment_date"),
            rs.getString("first_seen"),
            rs.getBigDecimal("total_charged"),
            rs.getBigDecimal("total_paid"),
            rs.getBigDecimal("pending_balance")
        );
    }
}
