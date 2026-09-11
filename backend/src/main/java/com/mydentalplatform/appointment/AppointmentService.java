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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.core.JacksonException;
import com.mydentalplatform.notification.NotificationService;
import tools.jackson.databind.ObjectMapper;

@Service
public class AppointmentService {
    private static final Logger LOG = LoggerFactory.getLogger(AppointmentService.class);
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm");
    private static final String BOOKING_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final NotificationService notificationService;
    private final com.mydentalplatform.video.DailyVideoClient video;
    private final SecureRandom random = new SecureRandom();

    @org.springframework.beans.factory.annotation.Autowired
    public AppointmentService(
        JdbcTemplate jdbcTemplate,
        ObjectMapper objectMapper,
        NotificationService notificationService,
        com.mydentalplatform.video.DailyVideoClient video
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
        this.notificationService = notificationService;
        this.video = video;
    }

    public AppointmentService(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this(jdbcTemplate, objectMapper, null, null);
    }

    @Transactional
    public String book(AppointmentController.BookingRequest request) {
        String mode = request.consultationMode() == null ? "in_person" : request.consultationMode();
        if (!List.of("in_person", "video").contains(mode)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid consultation mode.");
        if ("video".equals(mode)) validateVideoBooking(request);
        UUID selectedDoctorId = request.doctorId() == null
            ? resolveDoctor(request.clinicId(), request.date(), request.time()) : request.doctorId();
        validateSlot(request.clinicId(), selectedDoctorId, request.date(), request.time());
        if (request.date().atTime(request.time()).isBefore(java.time.LocalDateTime.now(java.time.ZoneId.of("Asia/Kolkata")))) {
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
                    confirmation_deadline, consent_version, consent_at, attribution, consultation_mode
                ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, now(), cast(? as jsonb), ?)
                """, appointmentId, request.clinicId(), selectedDoctorId, bookingRef,
                request.name().trim(), "+91" + phone, blankToNull(request.email()), request.service().trim(),
                request.date(), request.time(), request.source(), blankToNull(request.message()),
                request.confirmationDeadline(), request.consentVersion(), json(request.attribution()), mode);
            jdbcTemplate.update("""
                insert into appointment_slots (
                    clinic_id, doctor_id, appointment_id, appointment_date, appointment_time
                ) values (?, ?, ?, ?, ?)
                """, request.clinicId(), selectedDoctorId, appointmentId, request.date(), request.time());
            if (request.holdToken() != null && !request.holdToken().isBlank()) {
                jdbcTemplate.update("delete from appointment_slot_holds where hold_token = ?", request.holdToken().trim());
            } else {
                jdbcTemplate.update("""
                    delete from appointment_slot_holds
                    where clinic_id = ? and appointment_date = ? and appointment_time = ?
                    """, request.clinicId(), request.date(), request.time());
            }
            if (notificationService != null) {
                notificationService.notifyClinicNewAppointment(
                    request.clinicId(), bookingRef, request.name().trim(), "+91" + phone,
                    request.service().trim(), request.date(), request.time(), request.source());
            }
            try {
                String phoneE164 = "+91" + phone;
                String patientEmail = blankToNull(request.email());
                List<UUID> existing = jdbcTemplate.queryForList(
                    "SELECT id FROM users WHERE phone_e164 = ? AND role = 'patient' LIMIT 1",
                    UUID.class, phoneE164);
                UUID patientId;
                if (!existing.isEmpty()) {
                    patientId = existing.getFirst();
                } else {
                    UUID candidateId = UUID.randomUUID();
                    jdbcTemplate.update("""
                        INSERT INTO users (id, role, phone_e164, email, enabled)
                        VALUES (?, 'patient'::user_role, ?, ?, true)
                        ON CONFLICT DO NOTHING
                        """, candidateId, phoneE164, patientEmail);
                    patientId = jdbcTemplate.queryForObject(
                        "SELECT id FROM users WHERE phone_e164 = ? AND role = 'patient' LIMIT 1",
                        UUID.class, phoneE164);
                }
                jdbcTemplate.update("UPDATE appointments SET patient_id = ? WHERE id = ?",
                    patientId, appointmentId);
            } catch (Exception patientError) {
                // Best-effort — never block a booking
                LOG.warn("Patient linking skipped for appointment {}", appointmentId, patientError);
            }
            return bookingRef;
        } catch (DuplicateKeyException error) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "This time slot has just been taken. Please choose another time.", error);
        }
    }

    @Transactional
    public AppointmentController.HoldSlotResponse holdSlot(AppointmentController.HoldSlotRequest request) {
        jdbcTemplate.update("delete from appointment_slot_holds where expires_at < now()");

        UUID selectedDoctorId = request.doctorId() == null
            ? resolveDoctor(request.clinicId(), request.date(), request.time()) : request.doctorId();
        validateSlot(request.clinicId(), selectedDoctorId, request.date(), request.time());

        if (request.date().atTime(request.time()).isBefore(java.time.LocalDateTime.now(java.time.ZoneId.of("Asia/Kolkata")))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Please choose a current or future appointment slot.");
        }

        List<Map<String, Object>> existingHolds = jdbcTemplate.queryForList("""
            select id from appointment_slot_holds
            where clinic_id = ?
              and (? is null or doctor_id is null or doctor_id = ?)
              and appointment_date = ?
              and appointment_time = ?
              and expires_at > now()
            """, request.clinicId(), selectedDoctorId, selectedDoctorId, request.date(), request.time());
        if (!existingHolds.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "That time is temporarily reserved by another patient. Please choose another slot.");
        }

        String holdToken = UUID.randomUUID().toString().replace("-", "") + Long.toHexString(System.currentTimeMillis());
        OffsetDateTime expiresAt = OffsetDateTime.now().plusMinutes(10);

        try {
            jdbcTemplate.update("""
                insert into appointment_slot_holds (clinic_id, doctor_id, appointment_date, appointment_time, hold_token, expires_at)
                values (?, ?, ?, ?, ?, ?)
                """, request.clinicId(), selectedDoctorId, request.date(), request.time(), holdToken, expiresAt);
        } catch (DuplicateKeyException error) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "That time was just reserved. Please choose another slot.", error);
        }

        return new AppointmentController.HoldSlotResponse(holdToken, expiresAt.toInstant().toString());
    }

    @Transactional
    public void releaseHold(String holdToken) {
        if (holdToken != null && !holdToken.isBlank()) {
            jdbcTemplate.update("delete from appointment_slot_holds where hold_token = ?", holdToken.trim());
        }
    }

    private void validateVideoBooking(AppointmentController.BookingRequest request) {
        if (video == null || !video.configured()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
            "Video consultations are not available right now. Please book an in-clinic visit.");
        if (!"Video Consultation".equals(request.service()) || request.doctorId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a dentist and the video consultation service.");
        }
        String day = request.date().getDayOfWeek().name().substring(0, 3).toLowerCase(java.util.Locale.ROOT);
        Boolean enabled = jdbcTemplate.queryForObject("""
            select exists(select 1 from clinics c join doctors d on d.clinic_id = c.id
            where c.id = ? and c.active = true and c.marketplace_status = 'verified'
              and c.public_config->'marketplaceProfile'->>'videoConsultationEnabled' = 'true'
              and c.public_config->'marketplaceProfile'->>'acceptingNewPatients' = 'true'
              and d.id = ? and d.available = true
              and jsonb_exists(c.public_config->'marketplaceVerifiedDoctorIds', d.id::text)
              and d.schedule->?->>'enabled' = 'true'
              and ?::time >= (d.schedule->?->>'start')::time
              and ?::time < (d.schedule->?->>'end')::time
              and mod(extract(epoch from (?::time - (d.schedule->?->>'start')::time))::integer, 1800) = 0)
            """, Boolean.class, request.clinicId(), request.doctorId(), day,
            request.time(), day, request.time(), day, request.time(), day);
        if (!Boolean.TRUE.equals(enabled)) throw new ResponseStatusException(HttpStatus.CONFLICT,
            "This clinic or dentist is not available for the requested video consultation.");
    }

    private UUID resolveDoctor(UUID clinicId, LocalDate date, LocalTime time) {
        List<Map<String, Object>> doctors = jdbcTemplate.queryForList("""
            select id, available, schedule::text as schedule from doctors where clinic_id = ? order by id for update
            """, clinicId);
        if (doctors.isEmpty()) return null;
        for (Map<String, Object> doctor : doctors) {
            if (!Boolean.TRUE.equals(doctor.get("available"))) continue;
            Map<String, Object> schedule = objectMapper.readValue((String) doctor.get("schedule"), new tools.jackson.core.type.TypeReference<>() {});
            if (!ScheduleRules.slots(schedule, date).contains(time)) continue;
            UUID id = (UUID) doctor.get("id");
            Boolean reserved = jdbcTemplate.queryForObject("""
                select exists(select 1 from appointment_slots where clinic_id = ? and doctor_id = ? and appointment_date = ? and appointment_time = ?)
                """, Boolean.class, clinicId, id, date, time);
            if (Boolean.FALSE.equals(reserved)) return id;
        }
        throw new ResponseStatusException(HttpStatus.CONFLICT, "No doctor is available at that time. Choose another slot.");
    }

    private void validateSlot(UUID clinicId, UUID doctorId, LocalDate date, LocalTime time) {
        if (!date.atTime(time).isAfter(java.time.LocalDateTime.now(ScheduleRules.INDIA)))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a future appointment time.");
        if (doctorId == null) {
            if (time.getSecond() != 0 || time.getNano() != 0 || time.getMinute() % 30 != 0)
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a 30-minute appointment slot.");
            return;
        }
        // Serialize booking with schedule changes. The unique slot constraint handles competing reservations.
        List<String> schedules = jdbcTemplate.queryForList("""
            select d.schedule::text from doctors d join clinics c on c.id = d.clinic_id
            where d.id = ? and d.clinic_id = ? and d.available = true and c.active = true for update of d
            """, String.class, doctorId, clinicId);
        if (schedules.isEmpty()) throw new ResponseStatusException(HttpStatus.CONFLICT, "This doctor is unavailable at this clinic.");
        Map<String, Object> schedule = objectMapper.readValue(schedules.getFirst(), new tools.jackson.core.type.TypeReference<>() {});
        if (!ScheduleRules.slots(schedule, date).contains(time))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Choose a time within the doctor's available hours, outside breaks and days off.");
    }

    @Transactional
    public void reschedule(UUID clinicId, UUID appointmentId, AppointmentController.RescheduleRequest request) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
            select status::text as status, consultation_mode from appointments
            where id = ? and clinic_id = ? for update
            """, appointmentId, clinicId);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Appointment not found.");
        if (!List.of("pending", "confirmed").contains(rows.getFirst().get("status")))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only pending or confirmed appointments can be rescheduled.");
        validateSlot(clinicId, request.doctorId(), request.date(), request.time());
        if ("video".equals(rows.getFirst().get("consultation_mode"))) {
            validateVideoBooking(new AppointmentController.BookingRequest(clinicId, null, "", "", null,
                "Video Consultation", request.date(), request.time(), request.doctorId(), null,
                "clinic_website", null, null, null, "video"));
        }
        try {
            jdbcTemplate.update("delete from appointment_slots where appointment_id = ?", appointmentId);
            jdbcTemplate.update("""
                insert into appointment_slots(clinic_id, doctor_id, appointment_id, appointment_date, appointment_time)
                values (?, ?, ?, ?, ?)
                """, clinicId, request.doctorId(), appointmentId, request.date(), request.time());
            jdbcTemplate.update("""
                update appointments set doctor_id = ?, appointment_date = ?, appointment_time = ?,
                    updated_at = now() where id = ? and clinic_id = ?
                """, request.doctorId(), request.date(), request.time(), appointmentId, clinicId);
        } catch (DuplicateKeyException error) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "That time was just booked. The original appointment is unchanged.", error);
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

    public List<Map<String, Object>> patientAppointments(String phone) {
        return jdbcTemplate.queryForList("""
            select booking_ref from appointments where phone_e164 = ? order by appointment_date desc limit 100
            """, String.class, phone).stream().map(reference -> lookupAny(reference, phone)).toList();
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
        return list(clinicId, null, null, null, null, null, null, null, null);
    }

    public List<Map<String, Object>> list(
        UUID clinicId,
        String status,
        LocalDate date,
        LocalDate from,
        LocalDate to,
        UUID doctorId,
        String search,
        Integer limit,
        Integer offset
    ) {
        StringBuilder sql = new StringBuilder("""
            select a.*, d.name as doctor_name from appointments a
            left join doctors d on d.id = a.doctor_id
            where a.clinic_id = ?
            """);
        List<Object> params = new java.util.ArrayList<>();
        params.add(clinicId);

        if (status != null && !status.isBlank()) {
            sql.append(" and a.status = cast(? as appointment_status)");
            params.add(status.trim().toLowerCase());
        }
        if (date != null) {
            sql.append(" and a.appointment_date = ?");
            params.add(date);
        } else {
            if (from != null) {
                sql.append(" and a.appointment_date >= ?");
                params.add(from);
            }
            if (to != null) {
                sql.append(" and a.appointment_date <= ?");
                params.add(to);
            }
        }
        if (doctorId != null) {
            sql.append(" and a.doctor_id = ?");
            params.add(doctorId);
        }
        if (search != null && !search.isBlank()) {
            String pattern = "%" + search.trim().toLowerCase() + "%";
            sql.append(" and (lower(a.patient_name) like ? or a.phone_e164 like ? or upper(a.booking_ref) like ?)");
            params.add(pattern);
            params.add(pattern);
            params.add("%" + search.trim().toUpperCase() + "%");
        }

        sql.append(" order by a.appointment_date desc, a.appointment_time desc, a.created_at desc");

        if (limit != null && limit > 0) {
            sql.append(" limit ?");
            params.add(Math.min(limit, 500));
            if (offset != null && offset > 0) {
                sql.append(" offset ?");
                params.add(offset);
            }
        }

        return jdbcTemplate.query(sql.toString(), (resultSet, rowNumber) -> clinicValue(map(resultSet)), params.toArray());
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
        if ("video".equals(current.get("consultationMode"))) {
            if (request.service() != null && !"Video Consultation".equals(request.service())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A video appointment cannot be changed to an in-clinic treatment.");
            }
            if (date.atTime(time).isBefore(java.time.LocalDateTime.now(java.time.ZoneId.of("Asia/Kolkata")))) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Please choose a future video consultation time.");
            }
            validateVideoBooking(new AppointmentController.BookingRequest((UUID) current.get("rawClinicId"), null,
                "", "", null, "Video Consultation", date, time, doctorId, null, "marketplace", null, null, null, "video"));
        }
        boolean changed = !date.equals(current.get("rawDate")) || !time.equals(current.get("rawTime"));
        if (changed) {
            if (doctorId == null) doctorId = resolveDoctor((UUID) current.get("rawClinicId"), date, time);
            validateSlot((UUID) current.get("rawClinicId"), doctorId, date, time);
        }
        try {
            if (changed) {
                jdbcTemplate.update("delete from appointment_slots where appointment_id = ?", appointmentId);
                jdbcTemplate.update("""
                    insert into appointment_slots (clinic_id, doctor_id, appointment_id, appointment_date, appointment_time)
                    values (?, ?, ?, ?, ?)
                    """, current.get("rawClinicId"), doctorId, appointmentId, date, time);
            }
            jdbcTemplate.update("""
                update appointments set doctor_id = ?, service = coalesce(?, service), appointment_date = ?,
                    appointment_time = ?, message = coalesce(?, message), status = 'pending', updated_at = now()
                where id = ?
                """, doctorId, blankToNull(request.service()), date, time, blankToNull(request.message()), appointmentId);
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
        if (!List.of("pending", "confirmed").contains(current.get("status")))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This appointment can no longer be cancelled online.");
        if (!date.atTime(time).isAfter(java.time.LocalDateTime.now(ScheduleRules.INDIA).plusHours(24))) {
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
            select status::text as status, source, booking_ref, patient_name, email, appointment_date, appointment_time
            from appointments
            where id = ? and clinic_id = ? for update
            """, appointmentId, clinicId);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Appointment not found.");
        String currentStatus = String.valueOf(rows.getFirst().get("status"));
        String source = String.valueOf(rows.getFirst().get("source"));
        if (!AppointmentTransitions.allows(currentStatus, request.status()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This status change is not allowed. Refresh the appointment.");
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

        if (notificationService != null && List.of("confirmed", "cancelled", "declined").contains(request.status())) {
            Map<String, Object> apt = rows.getFirst();
            String patientEmail = (String) apt.get("email");
            String patientName = (String) apt.get("patient_name");
            String bookingRef = (String) apt.get("booking_ref");
            Object dateObj = apt.get("appointment_date");
            LocalDate date = dateObj instanceof LocalDate ld ? ld : dateObj instanceof java.sql.Date sd ? sd.toLocalDate() : LocalDate.parse(String.valueOf(dateObj));
            Object timeObj = apt.get("appointment_time");
            LocalTime time = timeObj instanceof LocalTime lt ? lt : timeObj instanceof java.sql.Time st ? st.toLocalTime() : LocalTime.parse(String.valueOf(timeObj));

            notificationService.notifyPatientStatusUpdate(
                clinicId, appointmentId, bookingRef, patientName, patientEmail,
                request.status(), date, time, request.cancellationReason());
        }
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

    private Map<String, Object> clinicValue(Map<String, Object> value) {
        Map<String, Object> result = new LinkedHashMap<>(value);
        result.keySet().removeIf(key -> key.startsWith("raw"));
        return result;
    }

    private Map<String, Object> publicValue(Map<String, Object> value) {
        Map<String, Object> result = clinicValue(value);
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
        value.put("consultationMode", resultSet.getString("consultation_mode"));
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
