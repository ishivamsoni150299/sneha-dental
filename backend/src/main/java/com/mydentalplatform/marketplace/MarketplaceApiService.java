package com.mydentalplatform.marketplace;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import com.mydentalplatform.clinic.ClinicQueryService;
import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

@Service
public class MarketplaceApiService {
    public static final String DEFAULT_REGION = "delhi-ncr";
    public static final ZoneId INDIA = ZoneId.of("Asia/Kolkata");

    private final ClinicQueryService clinics;
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public MarketplaceApiService(ClinicQueryService clinics, JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.clinics = clinics;
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    public SearchResponse search(String region, String query, String locality, String serviceId,
                                 Boolean acceptingNewPatients) {
        String normalizedRegion = text(region).isBlank() ? DEFAULT_REGION : text(region).toLowerCase(Locale.ROOT);
        String normalizedQuery = text(query).toLowerCase(Locale.ROOT);
        String normalizedLocality = text(locality).toLowerCase(Locale.ROOT);
        String normalizedService = text(serviceId).toLowerCase(Locale.ROOT);

        List<DentistSummary> dentists = clinics.findMarketplace(normalizedRegion).stream()
            .map(this::summary)
            .filter(item -> normalizedQuery.isBlank() || item.searchText().contains(normalizedQuery))
            .filter(item -> normalizedLocality.isBlank()
                || item.locality().toLowerCase(Locale.ROOT).equals(normalizedLocality))
            .filter(item -> normalizedService.isBlank() || item.serviceIds().contains(normalizedService))
            .filter(item -> acceptingNewPatients == null || item.acceptingNewPatients() == acceptingNewPatients)
            .sorted(Comparator.comparing(DentistSummary::acceptingNewPatients).reversed()
                .thenComparing(DentistSummary::clinicName))
            .toList();

        return new SearchResponse(dentists, dentists.size(), new SearchFilters(
            normalizedRegion, normalizedQuery, normalizedLocality, normalizedService, acceptingNewPatients));
    }

    public Optional<DentistDetail> detail(String slug) {
        return clinics.findMarketplaceBySlug(slug).map(clinic -> {
            Map<String, Object> profile = map(clinic.get("marketplaceProfile"));
            return new DentistDetail(summary(clinic), text(clinic.get("doctorQualification")),
                text(clinic.get("doctorBio")), text(clinic.get("phone")),
                text(clinic.get("whatsappNumber")), address(clinic, profile),
                mapList(clinic.get("hours")), mapList(clinic.get("services")),
                strings(profile.get("paymentMethods")), verifiedDoctors(clinic));
        });
    }

    public AvailabilityResponse availability(String slug, LocalDate from, int days) {
        Map<String, Object> clinic = requireClinic(slug);
        UUID clinicId = UUID.fromString(text(clinic.get("id")));
        Set<UUID> verifiedIds = verifiedDoctorIds(clinic);
        LocalDate today = LocalDate.now(INDIA);
        LocalDate start = from == null || from.isBefore(today) ? today : from;
        int range = Math.max(1, Math.min(days, 14));
        LocalDate end = start.plusDays(range - 1L);

        List<DoctorSchedule> doctors = jdbcTemplate.query("""
            select id, name, schedule::text as schedule from doctors
            where clinic_id = ? and available = true order by name
            """, (rs, row) -> new DoctorSchedule(rs.getObject("id", UUID.class), rs.getString("name"),
                json(rs.getString("schedule"))), clinicId).stream()
            .filter(doctor -> verifiedIds.contains(doctor.id())).toList();

        Set<String> reserved = new LinkedHashSet<>(jdbcTemplate.query("""
            select doctor_id, appointment_date, appointment_time from appointment_slots
            where clinic_id = ? and appointment_date between ? and ?
            """, (rs, row) -> slotKey(rs.getObject("doctor_id", UUID.class),
                rs.getObject("appointment_date", LocalDate.class),
                rs.getObject("appointment_time", LocalTime.class)), clinicId, start, end));

        OffsetDateTime now = OffsetDateTime.now(INDIA);
        List<AvailabilityDay> result = new ArrayList<>();
        for (int offset = 0; offset < range; offset++) {
            LocalDate date = start.plusDays(offset);
            List<AvailabilitySlot> slots = new ArrayList<>();
            for (DoctorSchedule doctor : doctors) {
                Map<String, Object> schedule = map(doctor.schedule().get(dayKey(date)));
                if (!Boolean.TRUE.equals(schedule.get("enabled"))) continue;
                LocalTime opens = parseTime(schedule.get("start"));
                LocalTime closes = parseTime(schedule.get("end"));
                if (opens == null || closes == null || !opens.isBefore(closes)) continue;
                for (LocalTime time = opens; time.isBefore(closes); time = time.plusMinutes(30)) {
                    if (date.equals(today) && !time.isAfter(now.toLocalTime())) continue;
                    if (reserved.contains(slotKey(doctor.id(), date, time))) continue;
                    String startsAt = OffsetDateTime.of(date, time, ZoneOffset.ofHoursMinutes(5, 30)).toString();
                    slots.add(new AvailabilitySlot(doctor.id(), doctor.name(), time, startsAt));
                }
            }
            slots.sort(Comparator.comparing(AvailabilitySlot::time).thenComparing(AvailabilitySlot::doctorName));
            result.add(new AvailabilityDay(date, slots));
        }
        return new AvailabilityResponse(slug, INDIA.getId(), result);
    }

    public BookingContext validateBooking(String slug, String serviceId, UUID doctorId,
                                          LocalDate date, LocalTime time) {
        Map<String, Object> clinic = requireClinic(slug);
        Map<String, Object> profile = map(clinic.get("marketplaceProfile"));
        if (!Boolean.TRUE.equals(profile.get("acceptingNewPatients"))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "This clinic is not accepting new appointment requests.");
        }
        if (!strings(profile.get("serviceIds")).contains(serviceId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "The selected treatment is not listed by this clinic.");
        }
        boolean available = availability(slug, date, 1).days().stream()
            .flatMap(day -> day.slots().stream())
            .anyMatch(slot -> slot.doctorId().equals(doctorId) && slot.time().equals(time));
        if (!available) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "This appointment time is no longer available.");
        }
        String prefix = text(clinic.get("bookingRefPrefix"));
        return new BookingContext(UUID.fromString(text(clinic.get("id"))), prefix.isBlank() ? "BK" : prefix);
    }

    public String serviceLabel(String serviceId) {
        return switch (serviceId) {
            case "dental-consultation" -> "Dental Consultation";
            case "cleaning-scaling" -> "Cleaning & Scaling";
            case "tooth-fillings" -> "Tooth Fillings";
            case "root-canal" -> "Root Canal Treatment";
            case "tooth-extraction" -> "Tooth Extraction";
            case "wisdom-tooth" -> "Wisdom Tooth Care";
            case "dental-implants" -> "Dental Implants";
            case "crowns-bridges" -> "Crowns & Bridges";
            case "dentures" -> "Dentures";
            case "braces-orthodontics" -> "Braces & Orthodontics";
            case "clear-aligners" -> "Clear Aligners";
            case "pediatric-dentistry" -> "Pediatric Dentistry";
            case "gum-treatment" -> "Gum Treatment";
            case "teeth-whitening" -> "Teeth Whitening";
            case "veneers-smile-design" -> "Veneers & Smile Design";
            case "emergency-dental-care" -> "Emergency Dental Care";
            default -> serviceId.replace('-', ' ');
        };
    }

    private Map<String, Object> requireClinic(String slug) {
        return clinics.findMarketplaceBySlug(slug)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Dentist not found."));
    }

    private DentistSummary summary(Map<String, Object> clinic) {
        Map<String, Object> profile = map(clinic.get("marketplaceProfile"));
        String slug = text(clinic.get("marketplaceSlug"));
        List<String> serviceIds = strings(profile.get("serviceIds"));
        String clinicName = text(clinic.get("name"));
        String dentistName = text(clinic.get("doctorName"));
        String locality = text(profile.get("locality"));
        String city = text(clinic.get("city"));
        return new DentistSummary(UUID.fromString(text(clinic.get("id"))), slug, clinicName,
            dentistName, locality, city, serviceIds, strings(profile.get("languages")),
            integer(profile.get("consultationFee")), Boolean.TRUE.equals(profile.get("acceptingNewPatients")),
            listingImage(clinic, profile), "/dentists/" + slug, "/dentists/" + slug + "/book");
    }

    private List<DoctorSummary> verifiedDoctors(Map<String, Object> clinic) {
        UUID clinicId = UUID.fromString(text(clinic.get("id")));
        Set<UUID> verified = verifiedDoctorIds(clinic);
        return jdbcTemplate.query("""
            select id, name, qualification, speciality from doctors
            where clinic_id = ? and available = true order by name
            """, (rs, row) -> new DoctorSummary(rs.getObject("id", UUID.class), rs.getString("name"),
                rs.getString("qualification"), rs.getString("speciality")), clinicId).stream()
            .filter(doctor -> verified.contains(doctor.id())).toList();
    }

    private Set<UUID> verifiedDoctorIds(Map<String, Object> clinic) {
        Set<UUID> result = new LinkedHashSet<>();
        for (String value : strings(clinic.get("marketplaceVerifiedDoctorIds"))) {
            try { result.add(UUID.fromString(value)); } catch (IllegalArgumentException ignored) { }
        }
        return result;
    }

    private String listingImage(Map<String, Object> clinic, Map<String, Object> profile) {
        String image = text(profile.get("listingImageUrl"));
        if (!image.isBlank()) return image;
        image = text(clinic.get("logoDataUrl"));
        return image.isBlank() ? "/assets/brand/mydentalplatform-logo-full.svg" : image;
    }

    private String address(Map<String, Object> clinic, Map<String, Object> profile) {
        return List.of(text(clinic.get("addressLine1")), text(clinic.get("addressLine2")),
            text(profile.get("locality")), text(clinic.get("city"))).stream()
            .filter(value -> !value.isBlank()).distinct().reduce((a, b) -> a + ", " + b).orElse("");
    }

    private String dayKey(LocalDate date) {
        return date.getDayOfWeek().name().substring(0, 3).toLowerCase(Locale.ROOT);
    }

    private String slotKey(UUID doctorId, LocalDate date, LocalTime time) {
        return doctorId + "|" + date + "|" + time.withSecond(0).withNano(0);
    }

    private LocalTime parseTime(Object value) {
        try { return LocalTime.parse(text(value)); } catch (RuntimeException ignored) { return null; }
    }

    private Map<String, Object> json(String value) {
        try { return objectMapper.readValue(value, new TypeReference<>() {}); }
        catch (JacksonException error) { return Map.of(); }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> map(Object value) {
        return value instanceof Map<?, ?> raw ? (Map<String, Object>) raw : Map.of();
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> mapList(Object value) {
        return value instanceof List<?> raw ? raw.stream().filter(Map.class::isInstance)
            .map(item -> (Map<String, Object>) item).toList() : List.of();
    }

    private List<String> strings(Object value) {
        return value instanceof List<?> raw
            ? raw.stream().map(this::text).filter(item -> !item.isBlank()).toList() : List.of();
    }

    private Integer integer(Object value) {
        if (value instanceof Number number) return number.intValue();
        try { return value == null ? null : Integer.valueOf(value.toString()); }
        catch (NumberFormatException ignored) { return null; }
    }

    private String text(Object value) {
        return value == null ? "" : value.toString().trim();
    }

    private record DoctorSchedule(UUID id, String name, Map<String, Object> schedule) {}
    public record SearchFilters(String region, String query, String locality, String serviceId,
                                Boolean acceptingNewPatients) {}
    public record SearchResponse(List<DentistSummary> dentists, int count, SearchFilters filters) {}
    public record DentistSummary(UUID id, String slug, String clinicName, String dentistName,
        String locality, String city, List<String> serviceIds, List<String> languages,
        Integer consultationFee, boolean acceptingNewPatients, String imageUrl,
        String profilePath, String bookingPath) {
        String searchText() {
            return String.join(" ", clinicName, dentistName, locality, city,
                String.join(" ", serviceIds).replace('-', ' ')).toLowerCase(Locale.ROOT);
        }
    }
    public record DoctorSummary(UUID id, String name, String qualification, String speciality) {}
    public record DentistDetail(DentistSummary dentist, String qualification, String biography,
        String phone, String whatsapp, String address, List<Map<String, Object>> hours,
        List<Map<String, Object>> services, List<String> paymentMethods, List<DoctorSummary> doctors) {}
    public record AvailabilitySlot(UUID doctorId, String doctorName, LocalTime time, String startsAt) {}
    public record AvailabilityDay(LocalDate date, List<AvailabilitySlot> slots) {}
    public record AvailabilityResponse(String dentistSlug, String timezone, List<AvailabilityDay> days) {}
    public record BookingContext(UUID clinicId, String bookingRefPrefix) {}
}
