package com.mydentalplatform.marketplace;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

import com.mydentalplatform.appointment.AppointmentController;
import com.mydentalplatform.appointment.AppointmentService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1")
public class MarketplaceApiController {
    private final MarketplaceApiService marketplace;
    private final AppointmentService appointments;

    public MarketplaceApiController(MarketplaceApiService marketplace, AppointmentService appointments) {
        this.marketplace = marketplace;
        this.appointments = appointments;
    }

    @GetMapping("/dentists")
    MarketplaceApiService.SearchResponse dentists(
        @RequestParam(defaultValue = MarketplaceApiService.DEFAULT_REGION) String region,
        @RequestParam(defaultValue = "") String query,
        @RequestParam(defaultValue = "") String locality,
        @RequestParam(defaultValue = "") String serviceId,
        @RequestParam(required = false) Boolean acceptingNewPatients,
        @RequestParam(defaultValue = "50") @Min(1) @Max(50) int limit,
        @RequestParam(defaultValue = "0") @Min(0) int offset
    ) {
        return marketplace.search(region, query, locality, serviceId, acceptingNewPatients, limit, offset);
    }

    @GetMapping("/dentists/{slug}")
    ResponseEntity<MarketplaceApiService.DentistDetail> dentist(@PathVariable String slug) {
        if (!validSlug(slug)) return ResponseEntity.badRequest().build();
        return ResponseEntity.of(marketplace.detail(slug));
    }

    @GetMapping("/dentists/{slug}/availability")
    MarketplaceApiService.AvailabilityResponse availability(
        @PathVariable String slug,
        @RequestParam(required = false) LocalDate from,
        @RequestParam(defaultValue = "7") @Min(1) @Max(14) int days
    ) {
        if (!validSlug(slug)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid dentist slug.");
        }
        return marketplace.availability(slug, from, days);
    }

    @PostMapping("/appointments")
    BookingResponse book(@Valid @RequestBody BookingRequest request) {
        MarketplaceApiService.BookingContext context = marketplace.validateBooking(
            request.dentistSlug(), request.serviceId(), request.doctorId(), request.date(), request.time());
        String bookingRef = appointments.book(new AppointmentController.BookingRequest(
            context.clinicId(), context.bookingRefPrefix(), request.patientName(), request.phone(),
            request.email(), marketplace.serviceLabel(request.serviceId()), request.date(), request.time(),
            request.doctorId(), request.message(), "marketplace",
            OffsetDateTime.now(MarketplaceApiService.INDIA).plusHours(2), "2026-09-06",
            Map.of("marketplaceSlug", request.dentistSlug(), "channel", "chatgpt_or_public_api"), "in_person"
        ));
        return new BookingResponse(bookingRef, "pending",
            "Appointment request sent. The clinic will confirm the requested time.",
            "/appointments?claim=" + bookingRef);
    }

    private boolean validSlug(String slug) {
        return slug != null && slug.matches("^[a-z0-9]+(?:-[a-z0-9]+)*$");
    }

    public record BookingRequest(
        @NotBlank @Size(max = 120) String dentistSlug,
        @NotBlank @Size(max = 80) String serviceId,
        @NotNull UUID doctorId,
        @NotNull LocalDate date,
        @NotNull LocalTime time,
        @NotBlank @Size(min = 2, max = 120) String patientName,
        @NotBlank @Pattern(regexp = ".*[0-9]{10}.*") String phone,
        @Email @Size(max = 254) String email,
        @Size(max = 1000) String message,
        @AssertTrue(message = "Patient consent is required before sharing booking details.") boolean consentToShare
    ) {}

    public record BookingResponse(String bookingReference, String status, String message, String managePath) {}
}
