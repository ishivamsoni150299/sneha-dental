package com.mydentalplatform.auth;

import java.time.Clock;
import java.time.Instant;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Temporary, explicitly enabled patient test credential. Never applies to staff portals. */
@Component
public class TestPhoneOtp {
    public static final String PHONE = "+919473903051";
    private final boolean enabled;
    private final Instant validUntil;
    private final Clock clock;

    @org.springframework.beans.factory.annotation.Autowired
    public TestPhoneOtp(@Value("${platform.auth.test-phone-otp-enabled:false}") boolean enabled,
        @Value("${platform.auth.test-phone-otp-valid-until:1970-01-01T00:00:00Z}") String validUntil) {
        this(enabled, Instant.parse(validUntil), Clock.systemUTC());
    }

    TestPhoneOtp(boolean enabled, Instant validUntil, Clock clock) {
        this.enabled = enabled;
        this.validUntil = validUntil;
        this.clock = clock;
    }

    public boolean permits(String identity, String portal) {
        return enabled && clock.instant().isBefore(validUntil)
            && PHONE.equals(identity) && "patient".equals(portal);
    }

    public void check(String identity, String portal, String code) {
        if (!permits(identity, portal) || !"947390".equals(code))
            throw new AuthException("That code is incorrect or expired. Request a new code and try again.");
    }
}
