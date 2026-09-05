package com.mydentalplatform.appointment;

import java.security.SecureRandom;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

@Service
public class AppointmentService {
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm");
    private static final String BOOKING_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final SecureRandom random = new SecureRandom();

    public AppointmentService(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public String book(AppointmentController.BookingRequest request) {
        if (request.date().atTime(request.time()).isBefore(java.time.LocalDateTime.now())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "Please choose a current or future appointment slot.");
        }
        UUID appointmentId = UUID.randomUUID();
        String bookingRef = bookingRef(request.bookingRefPrefix());
        String phone = normalizePhone(request.phone());
        try {
            jdbcTemplate.update("""
                insert into appointments (
                    id, clinic_id, doctor_id, booking_ref, patient_name, phone_e164, email,
                    service, appointment_date, appointment_time, status, source, message,
                    confirmation_deadline, consent_version, consent_at, attribution
                ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, now(), cast(? as jsonb))
                """, appointmentId, request.clinicId(), request.doctorId(), bookingRef,
                request.name().trim(), "+91" + phone, blankToNull(request.email()), request.service().trim(),
                request.date(), request.time(), request.source(), blankToNull(request.message()),
                request.confirmationDeadline(), request.consentVersion(), json(request.attribution()));
            jdbcTemplate.update("""
                insert into appointment_slots (
                    clinic_id, doctor_id, appointment_id, appointment_date, appointment_time
                ) values (?, ?, ?, ?, ?)
                """, request.clinicId(), request.doctorId(), appointmentId, request.date(), request.time());
            return bookingRef;
        } catch (DuplicateKeyException error) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "This time slot has just been taken. Please choose another time.", error);
        }
    }

    public Map<String, Object> lookup(UUID clinicId, String bookingRef, String phone) {
        Map<String, Object> appointment = jdbcTemplate.query("""
            select a.*, d.name as doctor_name from appointments a
            left join doctors d on d.id = a.doctor_id
            where a.clinic_id = ? and upper(a.booking_ref) = upper(?)
              and right(regexp_replace(a.phone_e164, '[^0-9]', '', 'g'), 10) = ?
            limit 1
            """, resultSet -> resultSet.next() ? map(resultSet) : null,
            clinicId, bookingRef.trim(), normalizePhone(phone));
        return appointment == null ? null : publicValue(appointment);
    }

    public Map<String, Object> lookupAny(String bookingRef, String phone) {
        List<Map<String, Object>> appointments = jdbcTemplate.query("""
            select a.*, d.name as doctor_name, c.name as clinic_name,
                   c.marketplace_slug, c.public_config ->> 'phone' as clinic_phone,
                   concat_ws(', ', nullif(c.public_config ->> 'addressLine1', ''),
                       nullif(c.public_config ->> 'addressLine2', ''),
                       nullif(c.public_config ->> 'city', '')) as clinic_address,
                   r.id as review_id, r.rating as review_rating, r.review_text,
                   r.patient_alias, r.moderation_status::text as review_status,
                   r.clinic_response, r.clinic_responded_at, r.created_at as review_created_at,
                   r.published_at as review_published_at
            from appointments a
            join clinics c on c.id = a.clinic_id
            left join doctors d on d.id = a.doctor_id
            left join appointment_reviews r on r.appointment_id = a.id
            where upper(a.booking_ref) = upper(?)
              and right(regexp_replace(a.phone_e164, '[^0-9]', '', 'g'), 10) = ?
            limit 2
            """, (resultSet, rowNumber) -> patientSummary(resultSet),
            bookingRef.trim(), normalizePhone(phone));
        if (appointments.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,
            "No appointment matched that booking reference and phone number.");
        if (appointments.size() > 1) throw new ResponseStatusException(HttpStatus.CONFLICT,
            "More than one appointment matched. Please contact support.");
        return appointments.getFirst();
    }

    public List<Map<String, Object>> list(UUID clinicId) {
        return jdbcTemplate.query("""
            select a.*, d.name as doctor_name from appointments a
            left join doctors d on d.id = a.doctor_id
            where a.clinic_id = ? order by a.created_at desc
            """, (resultSet, rowNumber) -> publicValue(map(resultSet)), clinicId);
    }

    @Transactional
    public void patientUpdate(UUID appointmentId, AppointmentController.PatientUpdateRequest request) {
        Map<String, Object> current = requirePublic(appointmentId, request.phone());
        String status = String.valueOf(current.get("status"));
        if (!List.of("pending", "confirmed").contains(status)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "This appointment can no longer be changed online.");
        }
        LocalDate date = request.date() == null ? (LocalDate) current.get("rawDate") : request.date();
        LocalTime time = request.time() == null ? (LocalTime) current.get("rawTime") : request.time();
        UUID doctorId = (UUID) current.get("rawDoctorId");
        boolean changed = !date.equals(current.get("rawDate")) || !time.equals(current.get("rawTime"));
        try {
            if (changed) {
                jdbcTemplate.update("delete from appointment_slots where appointment_id = ?", appointmentId);
                jdbcTemplate.update("""
                    insert into appointment_slots (clinic_id, doctor_id, appointment_id, appointment_date, appointment_time)
                    values (?, ?, ?, ?, ?)
                    """, current.get("rawClinicId"), doctorId, appointmentId, date, time);
            }
            jdbcTemplate.update("""
                update appointments set service = coalesce(?, service), appointment_date = ?,
                    appointment_time = ?, message = coalesce(?, message), status = 'pending', updated_at = now()
                where id = ?
                """, blankToNull(request.service()), date, time, blankToNull(request.message()), appointmentId);
        } catch (DuplicateKeyException error) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "That new time slot is no longer available.", error);
        }
    }

    @Transactional
    public void patientCancel(UUID appointmentId, String phone) {
        Map<String, Object> current = requirePublic(appointmentId, phone);
        LocalDate date = (LocalDate) current.get("rawDate");
        LocalTime time = (LocalTime) current.get("rawTime");
        if (!date.atTime(time).isAfter(java.time.LocalDateTime.now().plusHours(24))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "Appointments cannot be cancelled online within 24 hours.");
        }
        jdbcTemplate.update("delete from appointment_slots where appointment_id = ?", appointmentId);
        jdbcTemplate.update("""
            update appointments set status = 'cancelled', cancellation_actor = 'patient', updated_at = now()
            where id = ?
            """, appointmentId);
    }

    @Transactional
    public void setStatus(UUID clinicId, UUID appointmentId, AppointmentController.StatusRequest request) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
            select status::text as status, source from appointments
            where id = ? and clinic_id = ? for update
            """, appointmentId, clinicId);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Appointment not found.");
        String currentStatus = String.valueOf(rows.getFirst().get("status"));
        String source = String.valueOf(rows.getFirst().get("source"));
        if (List.of("confirmed", "declined").contains(request.status()) && !"pending".equals(currentStatus)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This request has already been handled.");
        }
        if ("declined".equals(request.status()) && !"marketplace".equals(source)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "Only marketplace requests can be declined.");
        }
        if (List.of("cancelled", "declined").contains(request.status())) {
            jdbcTemplate.update("delete from appointment_slots where appointment_id = ?", appointmentId);
        }
        jdbcTemplate.update("""
            update appointments set status = cast(? as appointment_status),
                cancellation_reason = case when ? in ('cancelled', 'declined') then ? else cancellation_reason end,
                cancellation_actor = case when ? in ('cancelled', 'declined') then 'clinic' else cancellation_actor end,
                confirmation_responded_at = case when source = 'marketplace' and ? in ('confirmed', 'declined') then now() else confirmation_responded_at end,
                confirmed_at = case when ? = 'confirmed' then now() else confirmed_at end,
                declined_at = case when ? = 'declined' then now() else declined_at end,
                updated_at = now()
            where id = ? and clinic_id = ?
            """, request.status(), request.status(), blankToNull(request.cancellationReason()), request.status(),
            request.status(), request.status(), request.status(), appointmentId, clinicId);
    }

    public void updateClinical(UUID clinicId, UUID appointmentId, AppointmentController.ClinicalRequest request) {
        int updated = jdbcTemplate.update("""
            update appointments set clinic_notes = coalesce(?, clinic_notes),
                treatment_done = coalesce(?, treatment_done), amount_charged = coalesce(?, amount_charged),
                payment_status = coalesce(?, payment_status), payment_method = coalesce(?, payment_method),
                updated_at = now() where id = ? and clinic_id = ?
            """, blankToNull(request.clinicNotes()), blankToNull(request.treatmentDone()), request.amountCharged(),
            blankToNull(request.paymentStatus()), blankToNull(request.paymentMethod()), appointmentId, clinicId);
        if (updated != 1) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Appointment not found.");
    }

    private Map<String, Object> requirePublic(UUID appointmentId, String phone) {
        List<Map<String, Object>> rows = jdbcTemplate.query("""
            select a.*, d.name as doctor_name from appointments a
            left join doctors d on d.id = a.doctor_id
            where a.id = ? and right(regexp_replace(a.phone_e164, '[^0-9]', '', 'g'), 10) = ?
            for update of a
            """, (resultSet, rowNumber) -> map(resultSet), appointmentId, normalizePhone(phone));
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Appointment not found.");
        return rows.getFirst();
    }

    private Map<String, Object> publicValue(Map<String, Object> value) {
        Map<String, Object> result = new LinkedHashMap<>(value);
        result.keySet().removeIf(key -> key.startsWith("raw"));
        result.remove("clinicNotes");
        result.remove("treatmentDone");
        result.remove("amountCharged");
        result.remove("paymentStatus");
        result.remove("paymentMethod");
        return result;
    }

    private Map<String, Object> patientSummary(ResultSet resultSet) throws SQLException {
        Map<String, Object> result = publicValue(map(resultSet));
        result.put("patientName", result.remove("name"));
        result.put("clinicName", resultSet.getString("clinic_name"));
        result.put("clinicPhone", resultSet.getString("clinic_phone"));
        result.put("clinicAddress", resultSet.getString("clinic_address"));
        result.put("marketplaceSlug", resultSet.getString("marketplace_slug"));
        UUID reviewId = resultSet.getObject("review_id", UUID.class);
        if (reviewId == null) {
            result.put("review", null);
        } else {
            Map<String, Object> review = new LinkedHashMap<>();
            review.put("id", reviewId.toString());
            review.put("rating", resultSet.getInt("review_rating"));
            review.put("text", resultSet.getString("review_text"));
            review.put("patientAlias", resultSet.getString("patient_alias"));
            review.put("moderationStatus", resultSet.getString("review_status"));
            review.put("clinicResponse", resultSet.getString("clinic_response"));
            review.put("clinicRespondedAt", instant(resultSet, "clinic_responded_at"));
            review.put("createdAt", instant(resultSet, "review_created_at"));
            review.put("publishedAt", instant(resultSet, "review_published_at"));
            result.put("review", review);
        }
        return result;
    }

    private Map<String, Object> map(ResultSet resultSet) throws SQLException {
        Map<String, Object> value = new LinkedHashMap<>();
        UUID id = resultSet.getObject("id", UUID.class);
        UUID clinicId = resultSet.getObject("clinic_id", UUID.class);
        UUID doctorId = resultSet.getObject("doctor_id", UUID.class);
        LocalDate date = resultSet.getObject("appointment_date", LocalDate.class);
        LocalTime time = resultSet.getObject("appointment_time", LocalTime.class);
        value.put("id", id.toString());
        value.put("clinicId", clinicId.toString());
        value.put("bookingRef", resultSet.getString("booking_ref"));
        value.put("name", resultSet.getString("patient_name"));
        value.put("phone", resultSet.getString("phone_e164"));
        value.put("phoneE164", resultSet.getString("phone_e164"));
        value.put("email", resultSet.getString("email"));
        value.put("service", resultSet.getString("service"));
        value.put("date", date.toString());
        value.put("time", time.format(TIME));
        value.put("doctorId", doctorId == null ? null : doctorId.toString());
        value.put("doctorName", resultSet.getString("doctor_name"));
        value.put("message", resultSet.getString("message"));
        value.put("status", resultSet.getString("status"));
        value.put("source", resultSet.getString("source"));
        value.put("cancellationReason", resultSet.getString("cancellation_reason"));
        value.put("cancellationActor", resultSet.getString("cancellation_actor"));
        value.put("clinicNotes", resultSet.getString("clinic_notes"));
        value.put("treatmentDone", resultSet.getString("treatment_done"));
        value.put("amountCharged", resultSet.getBigDecimal("amount_charged"));
        value.put("paymentStatus", resultSet.getString("payment_status"));
        value.put("paymentMethod", resultSet.getString("payment_method"));
        value.put("confirmationDeadline", instant(resultSet, "confirmation_deadline"));
        value.put("confirmationRespondedAt", instant(resultSet, "confirmation_responded_at"));
        value.put("confirmedAt", instant(resultSet, "confirmed_at"));
        value.put("declinedAt", instant(resultSet, "declined_at"));
        value.put("expiredAt", instant(resultSet, "expired_at"));
        value.put("createdAt", instant(resultSet, "created_at"));
        value.put("updatedAt", instant(resultSet, "updated_at"));
        value.put("rawClinicId", clinicId);
        value.put("rawDoctorId", doctorId);
        value.put("rawDate", date);
        value.put("rawTime", time);
        return value;
    }

    private String bookingRef(String prefix) {
        String safePrefix = prefix == null ? "BK" : prefix.replaceAll("[^A-Za-z0-9]", "").toUpperCase();
        if (safePrefix.isBlank()) safePrefix = "BK";
        StringBuilder value = new StringBuilder(safePrefix).append('-');
        for (int index = 0; index < 8; index++) value.append(BOOKING_CHARS.charAt(random.nextInt(BOOKING_CHARS.length())));
        return value.toString();
    }

    private String normalizePhone(String phone) {
        String digits = phone == null ? "" : phone.replaceAll("[^0-9]", "");
        if (digits.length() < 10) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A valid phone is required.");
        return digits.substring(digits.length() - 10);
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String json(Object value) {
        try {
            return objectMapper.writeValueAsString(value == null ? Map.of() : value);
        } catch (JacksonException error) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid attribution data.", error);
        }
    }

    private String instant(ResultSet resultSet, String column) throws SQLException {
        OffsetDateTime value = resultSet.getObject(column, OffsetDateTime.class);
        return value == null ? null : value.toInstant().toString();
    }
}