package com.mydentalplatform.appointment;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.mydentalplatform.notification.NotificationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class AppointmentReminderScheduler {
    private static final Logger LOG = LoggerFactory.getLogger(AppointmentReminderScheduler.class);
    private final JdbcTemplate jdbcTemplate;
    private final NotificationService notificationService;

    public AppointmentReminderScheduler(JdbcTemplate jdbcTemplate, NotificationService notificationService) {
        this.jdbcTemplate = jdbcTemplate;
        this.notificationService = notificationService;
    }

    @Scheduled(cron = "0 0 8 * * *", zone = "Asia/Kolkata")
    public void sendUpcomingAppointmentReminders() {
        LOG.info("Running daily upcoming appointment reminder job");
        try {
            LocalDate tomorrow = LocalDate.now().plusDays(1);
            List<Map<String, Object>> upcoming = jdbcTemplate.queryForList("""
                select a.id, a.clinic_id, a.booking_ref, a.patient_name, a.email,
                       a.phone_e164, a.service, a.appointment_date, a.appointment_time,
                       c.name as clinic_name
                from appointments a
                join clinics c on c.id = a.clinic_id
                where a.status = 'confirmed'
                  and a.appointment_date = ?
                  and not exists (
                      select 1 from notifications n
                      where n.appointment_id = a.id
                        and n.notification_type = 'appointment_reminder'
                  )
                """, tomorrow);

            for (Map<String, Object> apt : upcoming) {
                UUID appointmentId = (UUID) apt.get("id");
                UUID clinicId = (UUID) apt.get("clinic_id");
                String bookingRef = (String) apt.get("booking_ref");
                String patientName = (String) apt.get("patient_name");
                String patientEmail = (String) apt.get("email");

                Object dateObj = apt.get("appointment_date");
                LocalDate date = dateObj instanceof LocalDate ld ? ld : ((java.sql.Date) dateObj).toLocalDate();
                Object timeObj = apt.get("appointment_time");
                LocalTime time = timeObj instanceof LocalTime lt ? lt : ((java.sql.Time) timeObj).toLocalTime();

                if (patientEmail != null && !patientEmail.isBlank()) {
                    notificationService.notifyPatientStatusUpdate(
                        clinicId, appointmentId, bookingRef, patientName, patientEmail,
                        "confirmed", date, time, "Reminder: Your appointment is tomorrow."
                    );
                }

                String idempotencyKey = "reminder_" + appointmentId + "_" + date;
                jdbcTemplate.update("""
                    insert into notifications (idempotency_key, clinic_id, appointment_id, notification_type, destination, status)
                    values (?, ?, ?, 'appointment_reminder', ?, 'sent')
                    on conflict (idempotency_key) do nothing
                    """, idempotencyKey, clinicId, appointmentId, patientEmail != null ? patientEmail : (String) apt.get("phone_e164"));
            }
            LOG.info("Finished processing {} upcoming appointment reminders", upcoming.size());
        } catch (Exception error) {
            LOG.error("Failed to process upcoming appointment reminders", error);
        }
    }

    @Scheduled(cron = "0 0 10 * * *", zone = "Asia/Kolkata")
    public void sendReviewInvitations() {
        LOG.info("Running daily review invitation job");
        try {
            LocalDate windowStart = LocalDate.now().minusDays(7);
            LocalDate windowEnd = LocalDate.now().minusDays(2);
            List<Map<String, Object>> completed = jdbcTemplate.queryForList("""
                SELECT a.id, a.clinic_id, a.booking_ref, a.patient_name, a.email,
                       a.appointment_date, c.name AS clinic_name
                FROM appointments a
                JOIN clinics c ON c.id = a.clinic_id
                WHERE a.status = 'completed'
                  AND a.appointment_date BETWEEN ? AND ?
                  AND a.email IS NOT NULL AND a.email != ''
                  AND NOT EXISTS (
                      SELECT 1 FROM notifications n
                      WHERE n.appointment_id = a.id AND n.notification_type = 'review_invitation'
                  )
                  AND NOT EXISTS (
                      SELECT 1 FROM appointment_reviews r WHERE r.appointment_id = a.id
                  )
                ORDER BY a.appointment_date DESC
                LIMIT 50
                """, windowStart, windowEnd);

            for (Map<String, Object> apt : completed) {
                UUID appointmentId = (UUID) apt.get("id");
                UUID clinicId = (UUID) apt.get("clinic_id");
                String bookingRef = (String) apt.get("booking_ref");
                String patientName = (String) apt.get("patient_name");
                String patientEmail = (String) apt.get("email");
                String clinicName = (String) apt.get("clinic_name");
                Object dateObj = apt.get("appointment_date");
                LocalDate date = dateObj instanceof LocalDate ld ? ld : ((java.sql.Date) dateObj).toLocalDate();

                notificationService.sendReviewInvitation(
                    clinicId, appointmentId, bookingRef, patientName, patientEmail, clinicName, date);
            }
            LOG.info("Sent {} review invitation emails", completed.size());
        } catch (Exception error) {
            LOG.error("Failed to process review invitations", error);
        }
    }
}
