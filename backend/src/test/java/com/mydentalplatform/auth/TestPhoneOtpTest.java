package com.mydentalplatform.auth;

import java.time.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class TestPhoneOtpTest {
    private static final Instant DEADLINE = Instant.parse("2026-09-12T18:30:00Z");
    private TestPhoneOtp mode(boolean enabled, Instant now) {
        return new TestPhoneOtp(enabled, DEADLINE, Clock.fixed(now, ZoneOffset.UTC));
    }

    @Test void acceptsOnlyConfiguredPatientNumberAndCode() {
        var otp = mode(true, DEADLINE.minusSeconds(60));
        assertDoesNotThrow(() -> otp.check(TestPhoneOtp.PHONE, "patient", "947390"));
        assertThrows(AuthException.class, () -> otp.check("+919473903052", "patient", "947390"));
        for (String portal : new String[]{"clinic", "platform", "dentist"})
            assertThrows(AuthException.class, () -> otp.check(TestPhoneOtp.PHONE, portal, "947390"));
        assertThrows(AuthException.class, () -> otp.check(TestPhoneOtp.PHONE, "patient", "000000"));
        assertThrows(AuthException.class, () -> otp.check(TestPhoneOtp.PHONE, "patient", null));
    }

    @Test void disabledAndExpiredModesFailClosedIncludingExactDeadline() {
        assertFalse(mode(false, DEADLINE.minusSeconds(1)).permits(TestPhoneOtp.PHONE, "patient"));
        assertFalse(mode(true, DEADLINE).permits(TestPhoneOtp.PHONE, "patient"));
        assertFalse(mode(true, DEADLINE.plusSeconds(1)).permits(TestPhoneOtp.PHONE, "patient"));
    }
}
