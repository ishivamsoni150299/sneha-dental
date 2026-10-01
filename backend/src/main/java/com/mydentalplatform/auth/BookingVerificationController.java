package com.mydentalplatform.auth;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.Map;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/public/booking-verification")
public class BookingVerificationController {
    private final BookingMobileVerification verification;
    public BookingVerificationController(BookingMobileVerification verification) { this.verification = verification; }
    @GetMapping public Map<String, Boolean> status() { return verification.status(); }
    @PostMapping("/request") public void request(@Valid @RequestBody Phone request) { verification.send(request.phone()); }
    @PostMapping("/verify") public Map<String, String> verify(@Valid @RequestBody Code request) { return Map.of("proof", verification.verify(request.phone(), request.code())); }
    record Phone(@NotBlank @Pattern(regexp = "(?:\\+91)?[6-9][0-9]{9}") String phone) {}
    record Code(@NotBlank @Pattern(regexp = "(?:\\+91)?[6-9][0-9]{9}") String phone, @NotBlank @Pattern(regexp = "[0-9]{4,10}") String code) {}
}
